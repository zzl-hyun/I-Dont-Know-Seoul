import { describe, expect, it } from "vitest";
import {
  localeFromPath,
  localizeDataError,
  localizePath,
  stripLocalePrefix,
  switchLocaleHref,
} from "./locale";

describe("locale URL routing", () => {
  it.each([
    ["/", "ko"],
    ["/guide/suwon/", "ko"],
    ["/en/", "en"],
    ["/en/guide/suwon/", "en"],
    ["/ja/", "ja"],
    ["/ja/guide/suwon/", "ja"],
  ] as const)("detects %s as %s", (path, expected) => {
    expect(localeFromPath(path)).toBe(expected);
  });

  it("keeps the content path while changing locale", () => {
    expect(localizePath("/guide/suwon/", "en")).toBe("/en/guide/suwon/");
    expect(localizePath("/en/guide/suwon/", "ja")).toBe("/ja/guide/suwon/");
    expect(localizePath("/ja/guide/suwon/", "ko")).toBe("/guide/suwon/");
    expect(stripLocalePrefix("/en/")).toBe("/");
    expect(
      switchLocaleHref(
        { pathname: "/en/guide/suwon/", search: "?to=x", hash: "#result" },
        "ja"
      )
    ).toBe("/ja/guide/suwon/?to=x#result");
  });

  it("localizes data-load failures without exposing Korean copy", () => {
    const source = "데이터를 불러오지 못했습니다 (HTTP 503)";
    expect(localizeDataError("en", source)).toBe("The data could not be loaded (HTTP 503).");
    expect(localizeDataError("ja", source)).toBe("データを読み込めませんでした（HTTP 503）。");
  });
});
