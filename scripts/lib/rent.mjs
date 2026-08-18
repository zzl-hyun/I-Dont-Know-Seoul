export const RENT_TYPES = ["house", "rowhouse", "officetel", "apartment"];

/** 보증금을 월세로 바꿀 때 쓰는 연 전월세전환율. */
export const RENT_CONVERSION_RATE = 0.055;

/** 1인 가구 후보로 집계하는 전용면적 범위. */
export const RENT_AREA_MIN = 10;
export const RENT_AREA_MAX_BY_TYPE = Object.freeze({
  house: 40,
  rowhouse: 40,
  officetel: 40,
  apartment: 60,
});

export const toConvertedMonthly = (depositMan, monthlyMan) =>
  monthlyMan + (depositMan * RENT_CONVERSION_RATE) / 12;

/**
 * 단지명으로 공공임대주택을 알아본다. 걸리면 월세 표본에서 뺀다.
 *
 * 공공임대는 소득·자산 요건을 통과한 사람만 그 값에 들어갈 수 있어서,
 * "이 동네에 방을 구하면 얼마" 를 재는 이 지표의 모집단이 아니다. 그런데
 * 실거래가에는 일반 계약과 섞여 들어오고, 단지 규모가 커서 소형 평형에서는
 * 표본을 통째로 지배한다. 삼평동(판교)이 448건 중 354건(79%)이 공공임대라
 * 순수월세 중앙값이 31만원으로 나왔는데, 공공임대를 빼면 140만원이다 —
 * 4.5배 차이다. 백현동·시흥동·도촌동은 소형 표본이 100% 공공임대였다.
 *
 * 판정은 이름만 본다. 실거래가 어디에도 임대주택 여부 플래그가 없기 때문이다.
 * 대상 지역 전수(서울 3개년 CSV + 경기 10개 구 API)에서 이 패턴에 걸린
 * 단지를 눈으로 확인했고 오탐은 0건이었다 — 성남판교경기행복주택,
 * 봇들마을5·6단지(주공)임대, 백현마을3·4단지(주공)임대, 판교제2테크노밸리LH1단지,
 * 휴먼시아섬마을(임대), LH동분당센트럴파크, 수원광교행복주택.
 *
 * 반대 방향(이름에 표기가 없는 공공임대)은 못 거른다. 서울은 이 패턴이
 * 2.8%뿐이고 비중 50%를 넘는 법정동이 하나도 없어서 실질 영향이 없었지만,
 * 그게 서울에 공공임대가 없어서인지 이름을 다르게 붙여서인지는 이름만으로
 * 구분할 수 없다. 새 지역을 넣을 때 소형 월세 중앙값이 유난히 낮으면
 * 이 함수부터 의심할 것.
 *
 * "휴먼시아"·"주공"·"마을" 처럼 분양 단지도 함께 쓰는 이름은 넣지 않는다.
 * 봇들마을3·4단지(주공)는 일반 분양이라 표본에 남아야 한다.
 */
const PUBLIC_RENTAL_NAME = /임대|행복주택|국민주택|장기전세|공공지원|매입임대|LH|SH공사/;

export function isPublicRentalName(name) {
  return PUBLIC_RENTAL_NAME.test(String(name ?? ""));
}

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
 * 반드시 RENT_TYPES 중 하나로만 태그해야 한다.
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
 * 주택유형 4종의 비어있지 않은 부분집합 15가지. 조합 안에서는 항상
 * house → rowhouse → officetel → apartment 순서다 — `RentComboKey`
 * (`src/types.ts`)를 만드는 규칙과 동일하다.
 */
export const RENT_COMBOS = combinations(RENT_TYPES);

const RENT_VARIANT_MODES = [
  ["converted", "converted"],
  ["raw", "monthly"],
];

function filterByCombo(pool, combo, field) {
  return pool.filter((p) => combo.includes(p.type)).map((p) => p[field]);
}

/**
 * 조합 15가지 × 모드 2가지(converted=보증금 환산 포함, raw=순수 월세)의
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
 * 백분위(`pct`)는 여기서 계산하지 않는다 — 556개 동 전체가 있어야 계산
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

function combinations(types) {
  const result = [];
  const visit = (start, targetSize, picked) => {
    if (picked.length === targetSize) {
      result.push([...picked]);
      return;
    }
    for (let i = start; i < types.length; i++) {
      picked.push(types[i]);
      visit(i + 1, targetSize, picked);
      picked.pop();
    }
  };
  for (let size = 1; size <= types.length; size++) visit(0, size, []);
  return result;
}
