export type InquiryCategory = "feedback" | "region" | "correction";

export interface InquiryOption {
  category: InquiryCategory;
  label: string;
  description: string;
}

export const INQUIRY_OPTIONS: readonly InquiryOption[] = [
  {
    category: "feedback",
    label: "서비스 피드백",
    description: "사용하면서 느낀 점을 들려주세요.",
  },
  {
    category: "region",
    label: "지역 추가 요청",
    description: "찾고 싶은 지역을 알려주세요.",
  },
  {
    category: "correction",
    label: "잘못된 정보 제보",
    description: "지역·통근·월세 데이터 오류를 알려주세요.",
  },
];

const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdddLtW2ooMD76gnTHghDF0rV2lRVbdXW6yjYOU-yNqekbcLQ/viewform";
const CATEGORY_ENTRY = "entry.2146128566";

const GOOGLE_FORM_CATEGORY: Record<InquiryCategory, string> = {
  feedback: "서비스 피드백",
  region: "지역 추가 요청",
  correction: "잘못된 정보 제보",
};

/**
 * 한 Google Form을 공유하되 메뉴에서 고른 문의 유형을 미리 채운다.
 * 응답용 URL은 공개 주소이므로 비밀값이 아니며, embedded 여부만 화면에 맞게 바꾼다.
 */
export function buildInquiryFormUrl(
  category: InquiryCategory,
  embedded: boolean
): string {
  const url = new URL(GOOGLE_FORM_URL);
  url.searchParams.set("usp", "pp_url");
  url.searchParams.set(CATEGORY_ENTRY, GOOGLE_FORM_CATEGORY[category]);
  if (embedded) url.searchParams.set("embedded", "true");
  return url.toString();
}
