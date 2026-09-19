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

      const { hit, data, missing, reason } = await readScopedCache(path, want);
      expect(hit).toBe(true);
      expect(missing).toBe(false);
      expect(reason).toBeNull();
      expect(data.elements).toEqual([{ type: "node", id: 1 }]);
    });
  });

  it("bbox 가 다른 want 로 읽으면 hit: false 이고 reason 에 bbox 가 들어간다", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "osm-subway.json");
      await writeScopedCache(path, want, { elements: [] });

      const narrower = { schema: CACHE_SCHEMA, bbox: "37.19,126.72,37.73,127.25" };
      const { hit, data, missing, reason } = await readScopedCache(path, narrower);
      expect(hit).toBe(false);
      expect(data).toBeNull();
      expect(missing).toBe(false);
      expect(reason).toContain("bbox");
    });
  });

  /*
   * payload 가 want 뒤에 펼쳐지므로 키가 겹치면 범위 메타가 덮인다. 캐시가
   * 자기 범위를 거짓으로 주장하게 되는 경로라 조용히 넘기면 안 된다.
   * (범위 메타 없는 옛 Overpass 응답을 거부하는지는 실제 조회 경로를 타는
   *  overpass.test.mjs 가 확인한다.)
   */
  it("payload 키가 범위 메타와 겹치면 저장을 거부한다", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "osm-subway.json");
      await expect(
        writeScopedCache(path, want, { bbox: "거짓범위", elements: [] })
      ).rejects.toThrow("겹칩니다");
    });
  });

  /*
   * 첫 실행에는 캐시 파일이 없는 게 정상이다(`data/raw/` 는 gitignore 대상).
   * 이걸 범위 불일치와 같이 다루면 호출부가 매번 "캐시 버림 — ENOENT …" 를
   * 찍어, 버릴 게 없었는데 버렸다고 말하게 된다. 그래서 사유를 비워 둔다.
   */
  it("파일이 아예 없으면 missing 이고 경고할 사유는 없다", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "does-not-exist.json");
      const { hit, data, missing, reason } = await readScopedCache(path, want);
      expect(hit).toBe(false);
      expect(data).toBeNull();
      expect(missing).toBe(true);
      expect(reason).toBeNull();
    });
  });

  it("손상된 JSON 은 throw 하지 않되 파일 없음과 구분해 사유를 남긴다", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "broken.json");
      await writeFile(path, "{ not valid json");
      const { hit, missing, reason } = await readScopedCache(path, want);
      expect(hit).toBe(false);
      expect(missing).toBe(false);
      expect(reason).toBeTruthy();
    });
  });
});
