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
