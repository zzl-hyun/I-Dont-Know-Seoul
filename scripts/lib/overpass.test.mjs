import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CACHE_SCHEMA, fetchOverpassCached } from "./overpass.mjs";

/*
 * 이 파일의 존재 이유.
 *
 * 원래 2-subway.mjs 의 fetchOsm() 은 캐시 파일이 읽히기만 하면 범위 검증 없이
 * 그대로 썼다. BBOX 를 넓혀도 옛 캐시가 재사용되어 새 지역의 역이 하나도 안
 * 들어오는데, 역이 없으면 그 동들은 "통근 불가"가 되어 결측이 아니라 "역이
 * 실제로 없는 동네"와 구분되지 않는다. 어떤 검증에도 안 걸렸다.
 *
 * 그 버그를 고치고 나서 테스트는 cache.mjs 헬퍼에만 붙였는데, 그건 헬퍼
 * 계약을 잠글 뿐 **호출부가 헬퍼를 실제로 부르는지**는 잠그지 않는다. 실제로
 * fetchOsm() 을 옛 readFile 직접 호출로 되돌리는 변이를 넣어보니 전체 293개가
 * 그대로 통과했다. 그래서 조회 경로를 이 모듈로 뽑고 fetch 를 주입받게 해서,
 * "캐시를 쓰면 네트워크를 한 번도 안 탄다" 를 호출 횟수로 세게 만들었다.
 */

const SEOUL = { schema: CACHE_SCHEMA, bbox: "37.40,126.70,37.72,127.22" };
const WIDER = { schema: CACHE_SCHEMA, bbox: "36.50,126.70,37.72,127.60" };
const QUERY = "[out:json];node(1);out;";
const MIRRORS = ["https://mirror-a.example/api", "https://mirror-b.example/api"];

const tmpDirs = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function cacheDir() {
  const dir = await mkdtemp(join(tmpdir(), "oneday-overpass-"));
  tmpDirs.push(dir);
  return dir;
}

/** 호출 횟수를 세는 fetch 스텁. */
function stubFetch(...responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (typeof next === "function") return next();
    return next;
  };
  return { impl, calls };
}

const ok = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });
const httpError = (status) => ({ ok: false, status, json: async () => ({}) });

/** 로그를 삼키고 모아 둔다. */
function collectLogs() {
  const lines = [];
  return { lines, log: (s) => lines.push(String(s)), write: () => {} };
}

const base = (dir, extra = {}) => ({
  cachePath: join(dir, "osm-subway.json"),
  want: SEOUL,
  query: QUERY,
  mirrors: MIRRORS,
  sleep: async () => {},
  ...collectLogs(),
  ...extra,
});

describe("Overpass 캐시 조회", () => {
  /*
   * 이 테스트가 원래 버그의 회귀 테스트다. 호출부가 범위 검증을 건너뛰고
   * 파일만 읽어 쓰던 옛 구현으로 되돌리면 캐시는 여전히 재사용되지만,
   * 아래 "범위가 다르면 다시 받는다" 가 깨진다. 여기서는 정상 경로를 잠근다.
   */
  it("범위가 같은 캐시가 있으면 네트워크를 한 번도 타지 않는다", async () => {
    const dir = await cacheDir();
    const seed = stubFetch(ok([{ type: "node", id: 1 }]));
    const first = await fetchOverpassCached(base(dir, { fetchImpl: seed.impl }));
    expect(first.source).toBe("network");
    expect(seed.calls).toHaveLength(1);

    const again = stubFetch(() => {
      throw new Error("호출되면 안 됨");
    });
    const second = await fetchOverpassCached(base(dir, { fetchImpl: again.impl }));

    expect(again.calls).toHaveLength(0);
    expect(second.source).toBe("cache");
    expect(second.elements).toEqual([{ type: "node", id: 1 }]);
  });

  /*
   * 대상 지역을 넓히는 상황이다. 옛 캐시를 조용히 재사용하면 새 지역 역이
   * 0개가 된다 — 그게 이 모듈이 존재하는 이유다.
   */
  it("범위가 달라지면 다시 받고 새 범위를 캐시에 기록한다", async () => {
    const dir = await cacheDir();
    const cachePath = join(dir, "osm-subway.json");
    await fetchOverpassCached(base(dir, { fetchImpl: stubFetch(ok([{ id: 1 }])).impl }));

    const refetch = stubFetch(ok([{ id: 1 }, { id: 2 }]));
    const result = await fetchOverpassCached(
      base(dir, { want: WIDER, fetchImpl: refetch.impl })
    );

    expect(refetch.calls).toHaveLength(1);
    expect(result.source).toBe("network");
    expect(result.elements).toHaveLength(2);

    const written = JSON.parse(await readFile(cachePath, "utf8"));
    expect(written.bbox).toBe(WIDER.bbox);
    expect(written.schema).toBe(CACHE_SCHEMA);
  });

  it("범위 메타가 없는 옛 Overpass 응답이 남아 있으면 다시 받는다", async () => {
    const dir = await cacheDir();
    const cachePath = join(dir, "osm-subway.json");
    // 옛 fetchOsm() 이 저장하던 모양 그대로 — 요청 범위가 어디에도 없다.
    await writeFile(
      cachePath,
      JSON.stringify({ version: 0.6, generator: "Overpass API", elements: [{ id: 9 }] })
    );

    const refetch = stubFetch(ok([{ id: 1 }]));
    const result = await fetchOverpassCached(base(dir, { fetchImpl: refetch.impl }));

    expect(refetch.calls).toHaveLength(1);
    expect(result.elements).toEqual([{ id: 1 }]);
  });

  it("범위는 맞는데 elements 가 없는 캐시는 터지지 않고 다시 받는다", async () => {
    const dir = await cacheDir();
    await writeFile(join(dir, "osm-subway.json"), JSON.stringify({ ...SEOUL }));

    const refetch = stubFetch(ok([{ id: 1 }]));
    const result = await fetchOverpassCached(base(dir, { fetchImpl: refetch.impl }));

    expect(refetch.calls).toHaveLength(1);
    expect(result.elements).toEqual([{ id: 1 }]);
  });
});

describe("Overpass 미러 재시도", () => {
  it("미러가 HTTP 오류면 다음 미러로 넘어간다", async () => {
    const dir = await cacheDir();
    const f = stubFetch(httpError(504), ok([{ id: 1 }]));
    const result = await fetchOverpassCached(base(dir, { fetchImpl: f.impl }));

    expect(f.calls).toHaveLength(2);
    expect(f.calls[0].url).toBe(MIRRORS[0]);
    expect(f.calls[1].url).toBe(MIRRORS[1]);
    expect(result.elements).toEqual([{ id: 1 }]);
  });

  it("빈 응답도 실패로 세고 다음 미러로 넘어간다", async () => {
    const dir = await cacheDir();
    const f = stubFetch(ok([]), ok([{ id: 1 }]));
    const result = await fetchOverpassCached(base(dir, { fetchImpl: f.impl }));

    expect(f.calls).toHaveLength(2);
    expect(result.elements).toEqual([{ id: 1 }]);
  });

  it("모든 미러가 실패하면 던지고 캐시를 건드리지 않는다", async () => {
    const dir = await cacheDir();
    const cachePath = join(dir, "osm-subway.json");
    await fetchOverpassCached(base(dir, { fetchImpl: stubFetch(ok([{ id: 1 }])).impl }));
    const before = await readFile(cachePath, "utf8");

    const f = stubFetch(httpError(500));
    await expect(
      fetchOverpassCached(base(dir, { want: WIDER, fetchImpl: f.impl, maxAttempts: 2 }))
    ).rejects.toThrow("Overpass 조회 실패");

    // 미러 2개 × 시도 2회
    expect(f.calls).toHaveLength(4);
    expect(await readFile(cachePath, "utf8")).toBe(before);
  });
});

describe("Overpass 캐시 로그", () => {
  /*
   * data/raw/ 는 gitignore 대상이라 새로 클론하면 캐시가 늘 없다. 그때
   * "캐시 버림" 을 찍으면 버릴 게 없었는데 버렸다고 말하게 된다.
   */
  it("캐시가 아예 없는 첫 실행에는 '버림' 을 찍지 않는다", async () => {
    const dir = await cacheDir();
    const logs = collectLogs();
    await fetchOverpassCached(base(dir, { ...logs, fetchImpl: stubFetch(ok([{ id: 1 }])).impl }));

    expect(logs.lines.some((l) => l.includes("캐시 버림"))).toBe(false);
  });

  it("범위가 어긋난 캐시를 버릴 때는 사유를 알린다", async () => {
    const dir = await cacheDir();
    await fetchOverpassCached(base(dir, { fetchImpl: stubFetch(ok([{ id: 1 }])).impl }));

    const logs = collectLogs();
    await fetchOverpassCached(
      base(dir, { ...logs, want: WIDER, fetchImpl: stubFetch(ok([{ id: 2 }])).impl })
    );

    const discarded = logs.lines.find((l) => l.includes("캐시 버림"));
    expect(discarded).toBeTruthy();
    expect(discarded).toContain("bbox");
  });
});
