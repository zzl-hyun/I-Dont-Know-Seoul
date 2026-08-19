import type { Locale } from "./locale";

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

const EN_LANDING: LandingVariant = {
  key: "default",
  path: "/en/",
  navLabel: "All neighborhood picks",
  seoTitle: "Where to Live Near Seoul | I Don't Know Seoul",
  seoDescription:
    "Compare neighborhoods across Seoul, Seongnam, Suwon, Yongin, and Dongtan by commute time, rent, safety, and convenience.",
  heroTitle: ["Not sure", "where to live?"],
  heroLead: [
    "Search for your workplace or school,",
    "then compare neighborhoods across Seoul and nearby Gyeonggi at a glance.",
  ],
  guideKicker: "Find a neighborhood",
  guideTitle: "Choose a place to live by commute and rent",
  guideLead:
    "Compare real commutes instead of generic popularity lists. Set a workplace or school, a commute limit, and a rent cap to explore all of Seoul plus Seongnam, Suwon, Suji and Giheung in Yongin, and Dongtan in Hwaseong with safety, price, and convenience data.",
  topics: [
    "Where to live in Seoul",
    "Commuting to Pangyo",
    "Commuting to Gangnam",
    "Living along the Shinbundang Line",
    "Where to live in Dongtan",
    "Rent comparison",
  ],
  cards: [
    {
      title: "Compare commutes to your destination",
      body: "Enter a workplace or school address and narrow the list using estimated subway, walking, and bus travel time.",
    },
    {
      title: "Stay within your rent budget",
      body: "Exclude areas above your rent cap, then compare price scores and transaction sample sizes for the remaining neighborhoods.",
    },
    {
      title: "Balance safety and convenience",
      body: "Adjust the weight of safety, price, and daily convenience to create a ranking that reflects your priorities.",
    },
  ],
  faqTitle: "How to use the neighborhood finder",
  faqs: [
    {
      question: "How are recommended neighborhoods selected?",
      answer:
        "Search for a workplace or school, set your commute and rent limits, and adjust the safety, price, and convenience weights. Matching administrative neighborhoods are then ranked in order.",
    },
    {
      question: "Can I find places for commuting to Pangyo or Gangnam?",
      answer:
        "Yes. Enter Pangyo Station, Gangnam Station, or a specific office address to compare estimated subway, walking, and bus commute times from Seoul and nearby Gyeonggi areas.",
    },
    {
      question: "Can I set a monthly rent budget?",
      answer:
        "Yes. Areas above your rent cap are removed from recommendations, while the remaining neighborhoods show deposit-adjusted rent and price scores.",
    },
    {
      question: "Which areas are covered?",
      answer:
        "The map covers all of Seoul, Seongnam, Suwon, Suji-gu and Giheung-gu in Yongin, and Dongtan in Hwaseong using one scoring and commute model.",
    },
  ],
  ctaTitle: "Where do you commute to?",
};

const JA_LANDING: LandingVariant = {
  key: "default",
  path: "/ja/",
  navLabel: "街選びマップ",
  seoTitle: "ソウル周辺の住む街選び | I Don't Know Seoul",
  seoDescription:
    "ソウル・ソンナム・スウォン・ヨンイン・華城トンタンの街を、通勤時間・家賃・治安・生活利便性で比較できます。",
  heroTitle: ["どこに住むか", "迷っているなら"],
  heroLead: [
    "勤務先や学校を検索して、",
    "ソウルと京畿道近郊の街をひと目で比較できます。",
  ],
  guideKicker: "住む街を探す",
  guideTitle: "通勤先と家賃から選ぶ街",
  guideLead:
    "漠然とした人気ランキングではなく、実際の通勤先を基準に比較します。勤務先や学校、通勤時間、家賃上限を設定すると、ソウル全域とソンナム・スウォン、ヨンイン市スジ区・キフン区、華城市トンタンの行政洞を治安・価格・生活利便性とともに確認できます。",
  topics: [
    "ソウルで住む街",
    "パンギョ通勤",
    "カンナム通勤",
    "新盆唐線沿線",
    "トンタンで住む街",
    "家賃比較",
  ],
  cards: [
    {
      title: "通勤先を基準に比較",
      body: "勤務先や学校の住所を目的地に設定し、地下鉄・徒歩・バスを合わせた推定通勤時間で候補を絞ります。",
    },
    {
      title: "家賃予算に合う街を検索",
      body: "家賃上限を超える地域を除外し、残った街の価格スコアと実取引サンプルを比較します。",
    },
    {
      title: "治安と生活利便性も比較",
      body: "通勤時間だけでなく、治安・価格・生活利便性の重みを調整して自分の基準で順位を作れます。",
    },
  ],
  faqTitle: "街選びマップの使い方",
  faqs: [
    {
      question: "おすすめの街はどのように選びますか？",
      answer:
        "勤務先や学校を検索し、通勤時間と家賃上限を設定して、治安・価格・生活利便性の重みを調整すると、条件に合う行政洞を順位で比較できます。",
    },
    {
      question: "パンギョやカンナムへの通勤に合う街も探せますか？",
      answer:
        "パンギョ駅やカンナム駅、実際の会社住所を目的地にすると、地下鉄・徒歩・バスを合わせた推定通勤時間でソウルと京畿道近郊の候補を絞れます。",
    },
    {
      question: "月々の家賃予算を設定できますか？",
      answer:
        "家賃上限を超える街をおすすめから除外し、残った地域の保証金換算家賃と価格スコアを比較できます。",
    },
    {
      question: "どの地域まで比較できますか？",
      answer:
        "ソウル全域、ソンナム、スウォン、ヨンイン市スジ区・キフン区、華城市トンタンを同じ評価基準と通勤条件で比較します。",
    },
  ],
  ctaTitle: "どこへ通勤しますか？",
};

export const LOCALIZED_LANDING_VARIANTS: Record<Locale, LandingVariant> = {
  ko: LANDING_VARIANTS.default,
  en: EN_LANDING,
  ja: JA_LANDING,
};

/**
 * 변형이 하나뿐이라 실질적으로는 상수 반환이지만, `src/App.tsx` 가 여전히
 * `getLandingVariant(window.location.pathname)` 형태로 호출한다 — 시그니처를
 * 유지해야 그쪽을 안 건드린다. `/guide/*` 로 들어온 요청은 애초에 정적
 * 문서(`src/seo/`)가 서빙하므로 이 함수까지 오지 않는다.
 */
export function getLandingVariant(_pathname: string, locale: Locale = "ko"): LandingVariant {
  return LOCALIZED_LANDING_VARIANTS[locale];
}
