import { describe, expect, it } from "vitest";
import { isSbizNightlifeClass } from "./sbiz.mjs";

describe("소상공인 유흥업소 분류", () => {
  it("일반·무도 유흥 주점만 포함한다", () => {
    expect(isSbizNightlifeClass("I21101")).toBe(true);
    expect(isSbizNightlifeClass("I21102")).toBe(true);
    expect(isSbizNightlifeClass("I21103")).toBe(false);
    expect(isSbizNightlifeClass("I21104")).toBe(false);
    expect(isSbizNightlifeClass("I20101")).toBe(false);
  });
});
