import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCache, CACHE_SCHEMA, readScopedCache, writeScopedCache } from "./cache.mjs";

const expectSbiz = { schema: CACHE_SCHEMA, guCodes: ["11110", "41135", "41465"] };

describe("캐시 범위 판정", () => {
  it("같은 범위면 재사용한다", () => {
    const r = checkCache({ schema: CACHE_SCHEMA, guCodes: ["11110", "41135", "41465"] }, expectSbiz);
    expect(r.usable).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("구 코드 순서가 달라도 같은 범위로 본다", () => {
    const r = checkCache({ schema: CACHE_SCHEMA, guCodes: ["41465", "11110", "41135"] }, expectSbiz);
    expect(r.usable).toBe(true);
  });

  /*
   * 이 테스트가 이 파일의 존재 이유다. 서울만 담긴 캐시로 수도권을 계산하면
   * 경기 동의 상가·버스 지표가 전부 0 이 되는데, 값이 비는 게 아니라 0 이라
   * 결측 검사에도 안 걸리고 파이프라인이 성공해 버린다.
   */
  it("요청 범위가 넓어졌으면 캐시를 버린다", () => {
    const seoulOnly = { schema: CACHE_SCHEMA, guCodes: ["11110"] };
    const r = checkCache(seoulOnly, expectSbiz);
    expect(r.usable).toBe(false);
    expect(r.reason).toContain("guCodes");
  });

  it("범위가 좁아진 경우에도 버린다", () => {
    const wider = { schema: CACHE_SCHEMA, guCodes: ["11110", "41135", "41465", "41461"] };
    expect(checkCache(wider, expectSbiz).usable).toBe(false);
  });

  it("메타가 없던 옛 캐시는 거부한다", () => {
    const r = checkCache({ elements: [] }, { schema: CACHE_SCHEMA, bbox: "37.19,126.72,37.73,127.25" });
    expect(r.usable).toBe(false);
    expect(r.reason).toContain("스키마");
  });

  it("bbox 가 다르면 거부한다 — OSM 캐시가 이 경로를 탄다", () => {
    const old = { schema: CACHE_SCHEMA, bbox: "37.41,126.75,37.72,127.20" };
    const r = checkCache(old, { schema: CACHE_SCHEMA, bbox: "37.19,126.72,37.73,127.25" });
    expect(r.usable).toBe(false);
    expect(r.reason).toContain("bbox");
  });

  it("캐시 파일이 아예 없으면 거부한다", () => {
    expect(checkCache(null, expectSbiz).usable).toBe(false);
    expect(checkCache(undefined, expectSbiz).usable).toBe(false);
  });
});

describe("범위 검증 캐시 읽기/쓰기", () => {
  const want = { schema: CACHE_SCHEMA, bbox: "37.40,126.70,37.72,127.22" };

  async function withTmpDir(fn) {
    const dir = await mkdtemp(join(tmpdir(), "cache-test-"));
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("같은 범위로 쓰고 읽으면 hit 이고 payload 가 들어 있다", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "osm-subway.json");
      await writeScopedCache(path, want, { elements: [{ type: "node", id: 1 }] });

      const { hit, data, reason } = await readScopedCache(path, want);
      expect(hit).toBe(true);
      expect(reason).toBeNull();
      expect(data.elements).toEqual([{ type: "node", id: 1 }]);
    });
  });

  it("bbox 가 다른 want 로 읽으면 hit: false 이고 reason 에 bbox 가 들어간다", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "osm-subway.json");
      await writeScopedCache(path, want, { elements: [] });

      const narrower = { schema: CACHE_SCHEMA, bbox: "37.19,126.72,37.73,127.25" };
      const { hit, data, reason } = await readScopedCache(path, narrower);
      expect(hit).toBe(false);
      expect(data).toBeNull();
      expect(reason).toContain("bbox");
    });
  });

  /*
   * 이 버그의 실제 재현 조건: 옛 fetchOsm() 은 Overpass 응답
   * { version, generator, elements } 를 요청 범위 메타 없이 그대로 저장했다.
   * schema 키가 없으니 checkCache 가 즉시 거부해야 한다 — 그래야 BBOX 를
   * 넓혔을 때 이 옛 캐시가 조용히 재사용되어 새 지역 역이 0개가 되는 사고가
   * 재발하지 않는다.
   */
  it("범위 메타가 없는 옛 Overpass 응답은 hit: false 다", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "osm-subway.json");
      await writeFile(
        path,
        JSON.stringify({ version: 0.6, generator: "Overpass API", elements: [{ type: "node", id: 1 }] })
      );

      const { hit, reason } = await readScopedCache(path, want);
      expect(hit).toBe(false);
      expect(reason).toContain("스키마");
    });
  });

  it("파일이 아예 없으면 hit: false 다", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "does-not-exist.json");
      const { hit, data, reason } = await readScopedCache(path, want);
      expect(hit).toBe(false);
      expect(data).toBeNull();
      expect(reason).toBeTruthy();
    });
  });

  it("손상된 JSON 이어도 throw 하지 않고 hit: false 다", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "broken.json");
      await writeFile(path, "{ not valid json");
      const { hit, reason } = await readScopedCache(path, want);
      expect(hit).toBe(false);
      expect(reason).toBeTruthy();
    });
  });
});
