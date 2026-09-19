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
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

/**
 * 범위 검증 캐시를 읽는다.
 *
 * `checkCache` 를 감싸 "파일 읽기 + JSON 파싱 + 판정"을 한 번에 처리한다.
 * 파일이 없거나 JSON 이 깨졌어도 throw 하지 않고 `hit: false` 로 흡수한다 —
 * 호출부가 빈 catch 로 "캐시 없음"을 삼키던 기존 관행과 동작을 맞추기 위해서다.
 *
 * 파일이 **아예 없는 것**(`missing: true`)과 **있는데 못 쓰는 것**(범위 불일치·
 * 손상)은 구분해 돌려준다. 첫 실행은 캐시가 없는 게 정상이라, 호출부가 여기에
 * "캐시 버림" 경고를 찍으면 버릴 게 없었는데 버렸다고 말하게 된다.
 *
 * 새 원본 캐시를 추가할 때는 파일을 직접 읽고 쓰지 말고 반드시 이 함수와
 * `writeScopedCache` 를 짝으로 쓸 것 — 캐시에 요청 범위를 안 남기면 대상
 * 지역을 넓혔을 때 옛 캐시가 조용히 재사용되어 새 지역 지표가 결측이 아니라
 * 0 으로 채워지는 사고가 재발한다(파일 상단 설명 참고).
 *
 * @param path 캐시 파일 경로
 * @param want { schema, ...범위키 } 형태의 기대값
 * @returns { hit: boolean, data: object | null, missing: boolean, reason: string | null }
 *          `missing` 이면 파일 자체가 없다 — 재수집은 하되 경고하지 않는다.
 */
export async function readScopedCache(path, want) {
  let parsed;
  try {
    const raw = await readFile(path, "utf8");
    parsed = JSON.parse(raw);
  } catch (err) {
    /* ENOENT 는 첫 실행의 정상 경로다. 깨진 JSON 은 정상이 아니라 사유를 남긴다. */
    const missing = err.code === "ENOENT";
    return {
      hit: false,
      data: null,
      missing,
      reason: missing ? null : `캐시를 읽을 수 없음 (${err.message})`,
    };
  }
  const { usable, reason } = checkCache(parsed, want);
  if (!usable) {
    return { hit: false, data: null, missing: false, reason };
  }
  return { hit: true, data: parsed, missing: false, reason: null };
}

/**
 * 범위 검증 캐시를 쓴다. `{ ...want, fetchedAt, ...payload }` 형태로 저장해
 * 다음 실행이 `readScopedCache` 로 이 범위를 다시 확인할 수 있게 한다.
 *
 * @param path 캐시 파일 경로
 * @param want 이번에 실제로 요청한 범위 ({ schema, ...범위키 })
 * @param payload 저장할 나머지 데이터 (예: { elements })
 */
export async function writeScopedCache(path, want, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ ...want, fetchedAt: new Date().toISOString(), ...payload })
  );
}
