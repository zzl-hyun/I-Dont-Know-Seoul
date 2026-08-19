/**
 * 예전에는 `/guide/pangyo-commute/` 등 검색어별 경로마다 이 React 앱을
 * 다른 변형으로 부팅했다. 지금은 검색어 저격 페이지가 전부 `src/seo/`
 * 아래에서 React 를 부팅하지 않는 순수 문서로 생성되므로(SEO 전략 —
 * `createRoot()`가 사전 렌더 내용을 지워버리는 문제를 근본적으로 없앤다),
 * 이 파일은 루트(`/`) 화면 문구 하나만 담는다.
 */
export type LandingVariantKey = "default";

export interface LandingGuideCard {
  title: string;
  body: string;
}

export interface LandingFaq {
  question: string;
  answer: string;
}

export interface LandingVariant {
  key: LandingVariantKey;
  path: string;
  navLabel: string;
  seoTitle: string;
  seoDescription: string;
  heroTitle: readonly [string, string];
  heroLead: readonly [string, string];
  guideKicker: string;
  guideTitle: string;
  guideLead: string;
  topics: readonly string[];
  cards: readonly LandingGuideCard[];
  faqTitle: string;
  faqs: readonly LandingFaq[];
  ctaTitle: string;
}

export const LANDING_VARIANTS: Record<LandingVariantKey, LandingVariant> = {
  default: {
    key: "default",
    path: "/",
    navLabel: "전체 자취 추천",
    seoTitle: "서울 자취 동네 추천 | I Don't Know Seoul",
    seoDescription:
      "회사·학교를 기준으로 서울·성남·수원·용인 수지·기흥·화성 동탄의 자취 동네를 통근시간·월세·치안·생활편의로 비교하세요.",
    heroTitle: ["어디 살아야", "할지 모르겠다면"],
    heroLead: [
      "회사나 학교를 검색하면,",
      "서울과 인접 경기의 자취 동네를 한눈에 비교합니다.",
    ],
    guideKicker: "자취 지역 찾기",
    guideTitle: "출근지와 월세로 찾는 자취 동네 추천",
    guideLead:
      "막연한 인기 순위 대신 실제 출근지를 기준으로 비교합니다. 회사나 학교를 검색하고 통근시간과 월세 상한을 정하면 서울 전체와 성남·수원, 용인 수지·기흥, 화성 동탄의 행정동을 치안·가격·생활편의와 함께 살펴볼 수 있습니다.",
    topics: [
      "서울 자취 추천",
      "판교 출근 자취",
      "강남 출근 자취",
      "신분당선 자취 추천",
      "동탄 자취 추천",
      "월세 비교",
    ],
    cards: [
      {
        title: "출근지 기준 통근 비교",
        body: "회사·학교 주소를 목적지로 넣고 지하철·도보·버스를 합산한 예상 통근시간으로 후보를 좁힙니다.",
      },
      {
        title: "월세 예산별 자취 추천",
        body: "월세 상한을 넘는 지역은 제외하고 남은 동네의 가격 점수와 실거래 표본을 비교합니다.",
      },
      {
        title: "치안·생활편의 함께 보기",
        body: "통근시간만 보지 않고 치안·가격·생활편의의 비중을 직접 조절해 내 기준의 순위를 만듭니다.",
      },
    ],
    faqTitle: "자취 동네 추천, 이렇게 이용합니다",
    faqs: [
      {
        question: "서울 자취 추천 지역을 어떻게 고르나요?",
        answer:
          "회사나 학교를 목적지로 검색한 뒤 통근시간과 월세 상한을 정하고 치안·가격·생활편의 가중치를 조절하면 조건에 맞는 행정동을 순서대로 비교할 수 있습니다.",
      },
      {
        question: "판교나 강남 출근에 맞는 동네도 찾을 수 있나요?",
        answer:
          "판교역이나 강남역, 실제 회사 주소를 목적지로 넣으면 지하철·도보·버스를 합산한 예상 통근시간으로 서울과 인접 경기 지역의 후보를 좁힐 수 있습니다.",
      },
      {
        question: "월세 예산을 정해서 추천받을 수 있나요?",
        answer:
          "월세 상한을 설정하면 예산을 넘는 동네를 추천 목록에서 제외하고, 남은 지역의 환산월세와 가격 점수를 비교할 수 있습니다.",
      },
      {
        question: "어느 지역까지 비교하나요?",
        answer:
          "서울 전체와 성남, 수원, 용인 수지구·기흥구, 화성 동탄의 행정동을 같은 평가 기준과 통근 조건으로 한 지도에서 비교합니다.",
      },
    ],
    ctaTitle: "어디로 출근하세요?",
  },
};

/**
 * 변형이 하나뿐이라 실질적으로는 상수 반환이지만, `src/App.tsx` 가 여전히
 * `getLandingVariant(window.location.pathname)` 형태로 호출한다 — 시그니처를
 * 유지해야 그쪽을 안 건드린다. `/guide/*` 로 들어온 요청은 애초에 정적
 * 문서(`src/seo/`)가 서빙하므로 이 함수까지 오지 않는다.
 */
export function getLandingVariant(_pathname: string): LandingVariant {
  return LANDING_VARIANTS.default;
}
