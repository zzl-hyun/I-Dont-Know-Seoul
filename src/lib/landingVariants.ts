export type LandingVariantKey = "default" | "pangyo" | "gangnam" | "sinbundang";

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
      "회사·학교를 기준으로 서울·성남·수원·용인 수지·기흥의 자취 동네를 통근시간·월세·치안·생활편의로 비교하세요.",
    heroTitle: ["어디 살아야", "할지 모르겠다면"],
    heroLead: [
      "회사나 학교를 검색하면,",
      "서울과 인접 경기의 자취 동네를 한눈에 비교합니다.",
    ],
    guideKicker: "자취 지역 찾기",
    guideTitle: "출근지와 월세로 찾는 자취 동네 추천",
    guideLead:
      "막연한 인기 순위 대신 실제 출근지를 기준으로 비교합니다. 회사나 학교를 검색하고 통근시간과 월세 상한을 정하면 서울 전체와 성남·수원, 용인 수지·기흥의 행정동을 치안·가격·생활편의와 함께 살펴볼 수 있습니다.",
    topics: [
      "서울 자취 추천",
      "판교 출근 자취",
      "강남 출근 자취",
      "신분당선 자취 추천",
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
          "서울 전체와 성남, 수원, 용인 수지구·기흥구의 행정동을 같은 평가 기준과 통근 조건으로 한 지도에서 비교합니다.",
      },
    ],
    ctaTitle: "어디로 출근하세요?",
  },
  pangyo: {
    key: "pangyo",
    path: "/guide/pangyo-commute/",
    navLabel: "판교 출근",
    seoTitle: "판교 출근 자취 추천 | 분당·수지·광교 비교",
    seoDescription:
      "판교역·판교 회사 출근 기준으로 분당·수지·광교와 서울의 자취 동네를 비교합니다. 통근시간·월세·치안·생활편의를 한 지도에서 확인하세요.",
    heroTitle: ["판교로 출근하는데", "어디 살아야 할지 모르겠다면"],
    heroLead: [
      "판교역이나 회사 주소를 검색하면,",
      "분당·수지·광교까지 통근과 월세를 함께 비교합니다.",
    ],
    guideKicker: "판교 출근 자취",
    guideTitle: "판교 출근 자취 추천 — 분당·수지·광교 비교",
    guideLead:
      "판교 출근은 행정구역보다 실제 통근 경로가 중요합니다. 판교와 가까운 분당뿐 아니라 신분당선으로 이어지는 수지·광교, 서울 지역까지 같은 통근 한계와 월세 예산을 적용해 비교해보세요.",
    topics: [
      "판교 출근 자취",
      "판교 자취 추천",
      "분당 자취",
      "수지 자취",
      "광교 자취",
    ],
    cards: [
      {
        title: "분당·판교 인접 생활권",
        body: "판교와의 거리뿐 아니라 이용 가능한 역까지의 도보·버스 접근시간과 환산월세를 함께 확인해 가까움의 실제 비용을 비교합니다.",
      },
      {
        title: "수지·신분당선 생활권",
        body: "동천·수지구청·성복·상현 주변을 판교까지의 예상 통근시간과 생활편의 점수로 살펴봅니다.",
      },
      {
        title: "광교·수원 생활권",
        body: "광교중앙·광교를 포함한 수원 지역이 내 통근 한계와 월세 상한 안에 들어오는지 지도에서 걸러봅니다.",
      },
    ],
    faqTitle: "판교 출근 자취를 찾을 때 자주 묻는 질문",
    faqs: [
      {
        question: "판교역이 아니라 실제 회사 주소도 검색할 수 있나요?",
        answer:
          "가능합니다. 회사명이나 주소를 검색하면 해당 좌표에서 가까운 역까지의 도보 구간을 반영하고, 도보가 15분을 넘으면 실제 버스 노선까지 계산해 각 동네의 예상 통근시간을 냅니다.",
      },
      {
        question: "분당·수지·광교를 한 번에 비교할 수 있나요?",
        answer:
          "서울 전체와 성남, 수원, 용인 수지구·기흥구를 하나의 평가 분포와 통근 조건으로 비교할 수 있습니다.",
      },
      {
        question: "판교까지 몇 분 이내인 동네만 볼 수 있나요?",
        answer:
          "통근시간 상한을 15분부터 90분 사이에서 조절하면 그 시간을 만족하는 행정동만 지도와 추천 목록에 남습니다.",
      },
      {
        question: "월세가 비싼 지역은 제외할 수 있나요?",
        answer:
          "월세 상한을 정하면 예산을 넘는 지역을 추천에서 제외하고, 남은 후보의 치안과 생활편의를 다시 비교합니다.",
      },
    ],
    ctaTitle: "판교까지, 내 조건으로 비교해보세요",
  },
  gangnam: {
    key: "gangnam",
    path: "/guide/gangnam-commute/",
    navLabel: "강남 출근",
    seoTitle: "강남 출근 자취 추천 | 서울·신분당선 비교",
    seoDescription:
      "강남역·강남 회사 출근 기준으로 서울과 분당·수지·광교의 자취 동네를 비교합니다. 통근시간·월세·치안·생활편의를 한 지도에서 확인하세요.",
    heroTitle: ["강남으로 출근하는데", "어디 살아야 할지 모르겠다면"],
    heroLead: [
      "강남역이나 회사 주소를 검색하면,",
      "서울과 신분당선 생활권의 자취 조건을 함께 비교합니다.",
    ],
    guideKicker: "강남 출근 자취",
    guideTitle: "강남 출근 자취 추천 — 서울·신분당선 생활권 비교",
    guideLead:
      "강남 출근 후보는 서울 안의 여러 지하철 노선과 분당·수지·광교의 신분당선 생활권으로 넓어집니다. 환승 횟수와 도보시간, 월세와 생활 조건을 같은 화면에서 비교해 내 우선순위에 맞는 동네를 찾습니다.",
    topics: [
      "강남 출근 자취",
      "강남역 자취 추천",
      "신분당선 자취",
      "서울 자취 추천",
      "강남 통근시간",
    ],
    cards: [
      {
        title: "서울 다노선 생활권",
        body: "강남으로 이어지는 서울 지하철 노선의 환승과 도보시간을 계산하고 월세·치안·생활편의를 함께 비교합니다.",
      },
      {
        title: "분당·정자·미금 생활권",
        body: "신분당선과 수인·분당선을 이용하는 성남 지역이 내 통근시간 상한 안에 들어오는지 확인합니다.",
      },
      {
        title: "수지·광교 생활권",
        body: "강남까지 직결되는 신분당선 남부 구간의 통근시간과 월세 예산 사이의 균형을 지도에서 비교합니다.",
      },
    ],
    faqTitle: "강남 출근 자취를 찾을 때 자주 묻는 질문",
    faqs: [
      {
        question: "강남역 외의 회사 주소도 목적지로 넣을 수 있나요?",
        answer:
          "가능합니다. 회사명이나 도로명주소를 검색하면 목적지 좌표를 기준으로 가까운 역까지의 도보시간과, 도보가 15분을 넘는 구간의 버스 접근시간까지 계산합니다.",
      },
      {
        question: "서울 밖의 신분당선 지역도 비교되나요?",
        answer:
          "성남 전체, 수원 전체와 용인 수지구·기흥구가 서울과 같은 평가 기준으로 포함됩니다. 용인 처인구와 경기 전체는 범위가 아닙니다.",
      },
      {
        question: "환승이 적은 동네를 따로 찾을 수 있나요?",
        answer:
          "추천은 총 통근시간을 기준으로 좁히며, 동네 상세에서 이용 역·노선·환승 구간과 횟수를 확인할 수 있습니다.",
      },
      {
        question: "회사와 학교 두 곳을 모두 만족하는 지역도 찾나요?",
        answer:
          "목적지를 최대 3곳까지 추가할 수 있으며, 설정한 통근시간 안에 모든 목적지에 도달하는 동네만 남길 수 있습니다.",
      },
    ],
    ctaTitle: "강남 출근, 내 예산으로 비교해보세요",
  },
  sinbundang: {
    key: "sinbundang",
    path: "/guide/sinbundang/",
    navLabel: "신분당선",
    seoTitle: "신분당선 자취 추천 | 분당·수지·광교 동네 비교",
    seoDescription:
      "신분당선 자취 지역을 분당·수지·광교와 서울까지 비교합니다. 강남·판교 통근시간, 월세, 치안과 생활편의를 한 지도에서 확인하세요.",
    heroTitle: ["신분당선 어디에서", "자취해야 할지 모르겠다면"],
    heroLead: [
      "강남·판교 같은 목적지를 검색하고,",
      "분당·수지·광교의 통근과 월세를 한 지도에서 비교합니다.",
    ],
    guideKicker: "신분당선 자취",
    guideTitle: "신분당선 자취 추천 — 분당·수지·광교 동네 비교",
    guideLead:
      "신분당선은 서울 강남권부터 판교·정자·수지·광교를 잇지만 같은 노선이라는 이유만으로 생활 조건까지 같지는 않습니다. 역 접근시간과 목적지까지의 통근, 월세·치안·생활편의를 함께 비교하세요.",
    topics: [
      "신분당선 자취 추천",
      "분당 자취",
      "수지 자취",
      "광교 자취",
      "판교 강남 출근",
    ],
    cards: [
      {
        title: "성남 — 판교·정자·미금",
        body: "판교 업무지구와 신분당선·수인분당선 환승 생활권을 실제 목적지별 통근시간으로 비교합니다.",
      },
      {
        title: "용인 — 동천·수지·성복·상현",
        body: "수지구 신분당선 구간과 기흥구를 월세 상한, 역 접근시간과 생활편의 조건으로 함께 살펴봅니다.",
      },
      {
        title: "수원 — 광교중앙·광교",
        body: "신분당선 남쪽 구간을 포함한 수원 전체에서 강남·판교 통근 조건을 만족하는 행정동을 찾습니다.",
      },
    ],
    faqTitle: "신분당선 자취를 찾을 때 자주 묻는 질문",
    faqs: [
      {
        question: "신분당선 역이 있는 동네만 보여주나요?",
        answer:
          "아닙니다. 서울·성남·수원과 용인 수지구·기흥구의 전체 대상 행정동을 평가하고, 설정한 목적지까지 통근 가능한 후보를 지도에서 거릅니다.",
      },
      {
        question: "판교와 강남을 동시에 목적지로 넣을 수 있나요?",
        answer:
          "가능합니다. 판교와 강남을 함께 추가하면 설정한 통근시간 안에 두 목적지를 모두 만족하는 동네만 남습니다.",
      },
      {
        question: "신분당선 자취 지역의 월세도 비교하나요?",
        answer:
          "국토교통부 실거래가로 계산한 환산월세 중앙값을 사용하며, 월세 상한을 적용해 예산 밖의 후보를 제외할 수 있습니다.",
      },
      {
        question: "용인과 수원은 어디까지 포함되나요?",
        answer:
          "수원은 전체 4개 구, 용인은 수지구와 기흥구를 포함합니다. 용인 처인구와 경기 전체는 현재 서비스 범위가 아닙니다.",
      },
    ],
    ctaTitle: "신분당선 생활권을 내 조건으로 비교해보세요",
  },
};

export const LANDING_NAV_ITEMS = (
  ["default", "pangyo", "gangnam", "sinbundang"] as const
).map((key) => LANDING_VARIANTS[key]);

/** trailing slash 유무를 허용하되, 알 수 없는 경로는 일반 랜딩으로 돌린다. */
export function getLandingVariant(pathname: string): LandingVariant {
  const normalized = pathname === "/" ? "/" : `${pathname.replace(/\/+$/, "")}/`;
  return (
    LANDING_NAV_ITEMS.find((variant) => variant.path === normalized) ??
    LANDING_VARIANTS.default
  );
}
