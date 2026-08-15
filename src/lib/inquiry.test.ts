import { describe, expect, it } from "vitest";
import {
  buildInquiryFormUrl,
  INQUIRY_OPTIONS,
  type InquiryCategory,
} from "./inquiry";

const EXPECTED_CATEGORY: Record<InquiryCategory, string> = {
  feedback: "서비스 피드백",
  region: "지역 추가 요청",
  correction: "잘못된 정보 제보",
};

describe("Google Forms 문의 링크", () => {
  it.each(INQUIRY_OPTIONS)("$label 유형을 사전 선택한다", ({ category }) => {
    const url = new URL(buildInquiryFormUrl(category, true));

    expect(url.origin).toBe("https://docs.google.com");
    expect(url.pathname).toBe(
      "/forms/d/e/1FAIpQLSdddLtW2ooMD76gnTHghDF0rV2lRVbdXW6yjYOU-yNqekbcLQ/viewform"
    );
    expect(url.searchParams.get("entry.2146128566")).toBe(
      EXPECTED_CATEGORY[category]
    );
    expect(url.searchParams.get("embedded")).toBe("true");
  });

  it("새 탭 링크에는 iframe 전용 파라미터를 넣지 않는다", () => {
    const url = new URL(buildInquiryFormUrl("feedback", false));

    expect(url.searchParams.has("embedded")).toBe(false);
    expect(url.searchParams.get("usp")).toBe("pp_url");
  });
});
