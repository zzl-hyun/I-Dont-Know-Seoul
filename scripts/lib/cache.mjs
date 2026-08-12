/**
 * 파이프라인 원본 캐시가 **지금 요청한 범위로 받은 것인지** 판정한다.
 *
 * 왜 필요한가: `data/raw/` 캐시는 있으면 그대로 쓰는 구조였다. 대상 지역을
 * 서울에서 수도권으로 넓혔을 때 서울 시절 캐시가 그대로 재사용되면
 * 경기 120개 동의 편의점·음식점·의료·버스가 **전부 0** 이 되는데,
 * 파이프라인은 "수집된 지표: …" 를 찍으며 **성공한다.** 값이 비는 게 아니라
 * 0 이라 결측 검사에도 안 걸린다.
 *
 * 그래서 캐시에 "무엇을 요청해 받은 것인지"를 함께 저장하고, 다음 실행의
 * 요청 범위와 다르면 캐시를 버린다. 사람이 지우는 걸 기억할 필요가 없어진다.
 */

/** 캐시 스키마 버전. 저장 형식을 바꾸면 올린다 — 옛 캐시가 자동으로 거부된다. */
export const CACHE_SCHEMA = 1;

/**
 * @param cached  파일에서 읽은 객체 (없으면 null/undefined)
 * @param expect  { schema, ...범위키 } 형태의 기대값
 * @returns { usable: boolean, reason: string | null }
 *          reason 은 사람이 읽을 재수집 사유. usable 이 true 면 null.
 */
export function checkCache(cached, expect) {
  if (!cached || typeof cached !== "object") {
    return { usable: false, reason: "캐시 없음" };
  }
  if (cached.schema !== expect.schema) {
    // 범위 메타가 없던 시절 캐시가 여기 걸린다. 조용히 쓰면 안 된다.
    return {
      usable: false,
      reason: `스키마 불일치 (캐시 ${cached.schema ?? "없음"} ≠ 기대 ${expect.schema})`,
    };
  }
  for (const [key, want] of Object.entries(expect)) {
    if (key === "schema") continue;
    const got = cached[key];
    if (!sameScope(got, want)) {
      return { usable: false, reason: `${key} 불일치 (캐시 ${fmt(got)} ≠ 요청 ${fmt(want)})` };
    }
  }
  return { usable: true, reason: null };
}

/** 배열은 순서를 무시하고 집합으로 비교한다 — 구 코드 순서가 바뀌어도 같은 범위다. */
function sameScope(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  return a === b;
}

function fmt(v) {
  if (Array.isArray(v)) return `${v.length}개`;
  return v === undefined ? "없음" : String(v);
}
