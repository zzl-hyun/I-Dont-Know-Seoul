import { describe, expect, it } from "vitest";
import { checkCache, CACHE_SCHEMA } from "./cache.mjs";

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
