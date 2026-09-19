/**
 * Overpass 조회 + 범위 검증 캐시.
 *
 * `2-subway.mjs` 에서 뽑아냈다. 이유는 **테스트 때문**이다 — 파이프라인
 * 스크립트는 import 시점에 `await main()` 이 돌아 테스트에서 못 부른다
 * (`sbiz.mjs` 를 뽑은 것과 같은 사정).
 *
 * 뽑기 전에는 이 경로에 회귀 테스트가 하나도 없었고, 실제로
 * **캐시를 범위 검증 없이 재사용하는 버그가 오래 살아 있었다.** BBOX 를
 * 넓혀도 옛 캐시가 그대로 쓰여 새 지역의 역이 하나도 안 들어오는데, 역이
 * 없으면 그 동들은 "통근 불가"가 되어 결측이 아니라 "역이 실제로 없는
 * 동네"와 구분되지 않아 어떤 검증에도 안 걸렸다.
 *
 * `fetchImpl`·`sleep`·`log` 를 주입받는 이유는 그 사고를 테스트로 잠그기
 * 위해서다 — "캐시를 쓰면 네트워크를 한 번도 안 탄다" 를 호출 횟수로 셀 수
 * 있어야 한다(`bus-sources.mjs` 가 먼저 쓴 방식).
 */
import { CACHE_SCHEMA, readScopedCache, writeScopedCache } from "./cache.mjs";

export { CACHE_SCHEMA };

/** Overpass 공개 인스턴스는 자주 과부하(504)가 난다. 미러를 돌아가며 재시도한다. */
export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

export const MAX_ATTEMPTS = 3;

/**
 * 캐시가 지금 요청 범위로 받은 것이면 그대로 쓰고, 아니면 다시 받아 저장한다.
 *
 * @param cachePath  캐시 파일 경로
 * @param want       `{ schema, bbox }` — 이 범위로 받았는지 대조한다
 * @param query      Overpass QL
 * @returns `{ elements, source: "cache" | "network" }`
 * @throws 모든 미러가 실패하면 던진다. 이때 캐시는 건드리지 않는다.
 */
export async function fetchOverpassCached({
  cachePath,
  want,
  query,
  mirrors = OVERPASS_MIRRORS,
  maxAttempts = MAX_ATTEMPTS,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log,
  write = (s) => process.stdout.write(s),
}) {
  const { hit, data, missing, reason } = await readScopedCache(cachePath, want);
  if (hit && Array.isArray(data.elements)) {
    log(`OSM 캐시 사용 (${data.elements.length.toLocaleString()}개 요소)`);
    return { elements: data.elements, source: "cache" };
  }

  /*
   * 첫 실행은 캐시가 없는 게 정상이라 조용히 받는다(`data/raw/` 는 gitignore
   * 대상). 있는데 못 쓸 때만 사유를 알린다 — 3-metrics.mjs 의 fetchPois() 와
   * 같은 동작이다. 범위는 맞는데 elements 가 없는 파일은 읽어봐야 터지므로
   * 못 쓰는 캐시로 친다.
   */
  const discardReason = hit ? "elements 배열이 없음" : reason;
  if (discardReason) log(`OSM 캐시 버림 — ${discardReason}. 다시 받습니다`);

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const mirror of mirrors) {
      const host = new URL(mirror).host;
      write(`Overpass 조회 (${attempt}/${maxAttempts}) ${host} ... `);
      try {
        const res = await fetchImpl(mirror, {
          method: "POST",
          // Overpass는 fetch의 기본 Content-Type(text/plain)을 406으로 거부한다.
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // HTTP 헤더 값은 latin-1만 허용되므로 한글을 넣으면 안 된다.
            "User-Agent": "oneday-data-pipeline/0.1 (Seoul neighborhood map)",
          },
          body: query,
        });
        if (!res.ok) {
          log(`실패 (HTTP ${res.status})`);
          lastError = new Error(`${host} → HTTP ${res.status}`);
          continue;
        }
        const json = await res.json();
        if (!json.elements?.length) {
          log("실패 (빈 응답)");
          lastError = new Error(`${host} → 빈 응답`);
          continue;
        }
        log(`성공 (${json.elements.length}개 요소)`);
        await writeScopedCache(cachePath, want, { elements: json.elements });
        return { elements: json.elements, source: "network" };
      } catch (err) {
        log(`실패 (${err.message})`);
        lastError = err;
      }
    }
    if (attempt < maxAttempts) {
      const waitSec = attempt * 15;
      log(`  ${waitSec}초 후 재시도...`);
      await sleep(waitSec * 1000);
    }
  }
  throw new Error(`Overpass 조회 실패 (모든 미러). 마지막 오류: ${lastError?.message}`);
}
