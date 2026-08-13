export const RENT_TYPES = ["house", "officetel", "apartment"];

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/**
 * `{value, type}` 표본 묶음을 유형별 중앙값·표본수로 나눈다.
 *
 * `3-metrics.mjs`는 import 시 `await main()`이 돌아 직접 테스트를 못 붙인다
 * (sbiz.mjs·cache.mjs와 같은 이유로 순수 함수만 여기로 뺐다). type이
 * RENT_TYPES 밖의 값이면 어느 버킷에도 안 잡히고 조용히 사라지므로, 호출부는
 * 반드시 house/officetel/apartment 중 하나로만 태그해야 한다.
 */
export function typeBreakdown(pool) {
  const byType = {};
  for (const type of RENT_TYPES) {
    const values = pool.filter((p) => p.type === type).map((p) => p.value);
    byType[type] = {
      medianMan: values.length ? round2(median(values)) : null,
      samples: values.length,
    };
  }
  return byType;
}

/**
 * 주택유형 3종의 비어있지 않은 부분집합 7가지. 항상 이 순서(house →
 * officetel → apartment 우선순위)로 만든다 — `RentComboKey`(`src/types.ts`)를
 * 만드는 규칙과 동일하다. `house+officetel+apartment`/converted 조합이
 * 기존 `monthlyRentMan`과 같은 조합이다.
 */
export const RENT_COMBOS = [
  ["house"],
  ["officetel"],
  ["apartment"],
  ["house", "officetel"],
  ["house", "apartment"],
  ["officetel", "apartment"],
  ["house", "officetel", "apartment"],
];

const RENT_VARIANT_MODES = [
  ["converted", "converted"],
  ["raw", "monthly"],
];

function filterByCombo(pool, combo, field) {
  return pool.filter((p) => combo.includes(p.type)).map((p) => p[field]);
}

/**
 * 조합 7가지 × 모드 2가지(converted=보증금 환산 포함, raw=순수 월세)의
 * 중앙값·표본수를 동 하나 단위로 계산한다.
 *
 * `pool` 항목은 `{ monthly, converted, type }` — `monthly`는 원본 월세,
 * `converted`는 보증금을 전월세전환율로 환산해 더한 값이다
 * (`3-metrics.mjs`의 `toMonthly()` 결과).
 *
 * `3-metrics.mjs`가 이미 갖고 있던 "동 표본이 `minSamples` 미만이면
 * 자치구(district) 표본으로 대체" 패턴을 14번 복붙하지 않고 여기 한 곳에서
 * 일반화했다. 부분집합 관계상 넓은 조합의 표본 수는 항상 좁은 조합
 * 이상이다(둘 다 같은 pool의 부분집합이므로) — 이 성질 덕분에
 * `house+officetel+apartment`/converted 조합을 이 함수로 계산해도 기존
 * `monthlyRentMan`/`rentSamples` 로직과 결과가 완전히 같다: 동 표본이
 * 부족하면 자치구 표본으로 대체하고 `samples: 0`을 찍는 것까지 동일한
 * 규칙이다.
 *
 * 백분위(`pct`)는 여기서 계산하지 않는다 — 547개 동 전체가 있어야 계산
 * 가능하니 동 하나 단위인 이 함수의 책임이 아니다. `4-score.mjs`가 담당한다.
 */
export function buildRentVariants(dongPool, districtPool, { minSamples }) {
  const result = { converted: {}, raw: {} };
  for (const combo of RENT_COMBOS) {
    const key = combo.join("+");
    for (const [modeKey, field] of RENT_VARIANT_MODES) {
      const dongValues = filterByCombo(dongPool, combo, field);
      if (dongValues.length >= minSamples) {
        result[modeKey][key] = { medianMan: round2(median(dongValues)), samples: dongValues.length };
        continue;
      }
      const districtValues = filterByCombo(districtPool, combo, field);
      if (districtValues.length >= minSamples) {
        result[modeKey][key] = { medianMan: round2(median(districtValues)), samples: 0 };
        continue;
      }
      result[modeKey][key] = { medianMan: null, samples: 0 };
    }
  }
  return result;
}
