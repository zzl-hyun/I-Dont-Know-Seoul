import { STATION_ALIASES } from "../data/geographicAliases";
import type { Locale } from "../lib/locale";
import type { AreaDef, AreaGroup } from "./areas";

interface AreaNames {
  en: string;
  ja: string;
}

const AREA_NAMES: Record<string, AreaNames> = {
  suwon: { en: "Suwon", ja: "スウォン" },
  bundang: { en: "Bundang", ja: "プンダン" },
  dongtan: { en: "Dongtan", ja: "トンタン" },
  gwanggyo: { en: "Gwanggyo", ja: "クァンギョ" },
  suji: { en: "Suji-gu", ja: "スジ区" },
  giheung: { en: "Giheung-gu", ja: "キフン区" },
  "gangnam-commute": { en: "Gangnam", ja: "カンナム" },
  "pangyo-commute": { en: "Pangyo", ja: "パンギョ" },
  sinbundang: { en: "the Shinbundang Line", ja: "新盆唐線沿線" },
  yeouido: { en: "Yeouido", ja: "ヨイド" },
  jongno: { en: "Gwanghwamun and Jongno", ja: "光化門・鍾路" },
  magok: { en: "Magok", ja: "マゴク" },
  "guro-digital": { en: "Guro Digital Complex", ja: "クロデジタル団地" },
  "gasan-digital": { en: "Gasan Digital Complex", ja: "カサンデジタル団地" },
  "sangam-dmc": { en: "Sangam DMC", ja: "サンアムDMC" },
  seongsu: { en: "Seongsu", ja: "ソンス" },
  hongdae: { en: "Hongdae", ja: "ホンデ" },
  sinchon: { en: "Sinchon", ja: "シンチョン" },
  konkuk: { en: "Konkuk University", ja: "建国大学周辺" },
  sillim: { en: "Sillim", ja: "シンリム" },
  wangsimni: { en: "Wangsimni", ja: "ワンシムニ" },
  "anam-korea": { en: "Anam and Korea University", ja: "安岩・高麗大学周辺" },
  hoegi: { en: "Hoegi", ja: "フェギ" },
  heukseok: { en: "Heukseok", ja: "フクソク" },
  noryangjin: { en: "Noryangjin", ja: "ノリャンジン" },
  "cheap-rent-seoul": { en: "Seoul's lowest-rent neighborhoods", ja: "ソウルで家賃が安い街" },
  "value-for-money-seoul": { en: "Seoul's best-value neighborhoods", ja: "ソウルでコスパの良い街" },
  "good-for-solo-seoul": { en: "convenient areas for living alone", ja: "一人暮らしに便利な街" },
  "safe-for-solo-seoul": { en: "safer areas for living alone", ja: "一人暮らしで治安を重視した街" },
};

function localizeAnchorName(name: string, locale: Exclude<Locale, "ko">): string {
  const canonical = name.endsWith("역") ? name.slice(0, -1) : name;
  const localized = STATION_ALIASES[canonical]?.[locale] ?? canonical;
  return locale === "en" ? `${localized} Station` : `${localized}駅`;
}

function localizedKeyword(group: AreaGroup, name: string, locale: Exclude<Locale, "ko">): string {
  if (locale === "en") {
    if (group === "commute") return `Where to live for a commute to ${name}`;
    if (group === "condition") return name;
    return `Where to live in ${name}`;
  }
  if (group === "commute") return `${name}への通勤に便利な街`;
  if (group === "condition") return name;
  return `${name}で住む街`;
}

function englishCopy(area: AreaDef, name: string): Pick<
  AreaDef,
  "keyword" | "title" | "seoDescription" | "h1" | "intro" | "faqs"
> {
  const keyword = localizedKeyword(area.group, name, "en");
  if (area.group === "condition") {
    return {
      keyword,
      title: `${name} | Data-based neighborhood ranking`,
      seoDescription: `Compare ${name.toLowerCase()} using measured rent, safety, convenience, and transit-access data across the service area.`,
      h1: `A measured ranking of ${name.toLowerCase()}`,
      intro: [
        "This ranking uses the same public and open-data metrics as the interactive map, rather than reviews or sponsored listings.",
        "Open the map to add a real destination, change the rent basis, and rebalance safety, price, and convenience for your own priorities.",
      ],
      faqs: [
        {
          question: "How is this ranking calculated?",
          answer:
            "Neighborhoods are ranked from measured rent transactions, safety indicators, daily-convenience density, and transit access. The result is relative within the 556-neighborhood coverage area.",
        },
        {
          question: "Can I use my own workplace and budget?",
          answer:
            "Yes. Open the interactive map, enter up to three destinations, set commute and rent limits, and adjust the category weights.",
        },
      ],
    };
  }

  const commute = area.group === "commute";
  return {
    keyword,
    title: `${keyword} | Rent, safety, and commute comparison`,
    seoDescription: commute
      ? `Compare neighborhoods for commuting to ${name} using estimated travel time, measured rent, safety, and convenience data.`
      : `Compare neighborhoods in ${name} using measured rent, safety, convenience, and station-access data.`,
    h1: commute ? `Where should you live when commuting to ${name}?` : `Where should you live in ${name}?`,
    intro: commute
      ? [
          `A familiar district name does not tell you the door-to-door commute. This guide compares candidate neighborhoods for ${name} using station access, subway travel, walking, and eligible first- or last-mile bus links.`,
          "The figures below use the same rent, safety, and convenience metrics as the map. Enter the exact office or school address for a personalized result.",
        ]
      : [
          `${name} contains neighborhoods with different rent levels, station access, safety indicators, and day-to-day amenities. This page compares them on the same measured basis.`,
          "Use the interactive map to add a workplace or school, set a maximum commute and rent budget, and see which area fits your priorities.",
        ],
    faqs: [
      {
        question: commute
          ? `Can I enter an exact address near ${name}?`
          : `Can I compare commutes from ${name}?`,
        answer:
          "Yes. The map accepts a company, school, station, or address and estimates subway, walking, and eligible bus-access time for each neighborhood.",
      },
      {
        question: "What rent figure is shown?",
        answer:
          "The default is the median deposit-adjusted monthly rent for small detached and multi-family homes from 2023–2025 new leases. Housing types and calculation mode can be changed in the app.",
      },
    ],
  };
}

function japaneseCopy(area: AreaDef, name: string): Pick<
  AreaDef,
  "keyword" | "title" | "seoDescription" | "h1" | "intro" | "faqs"
> {
  const keyword = localizedKeyword(area.group, name, "ja");
  if (area.group === "condition") {
    return {
      keyword,
      title: `${name}｜実測データによる街ランキング`,
      seoDescription: `${name}を、実取引家賃・治安・生活利便性・交通アクセスの公開データで比較します。`,
      h1: `${name}を実測データで比較`,
      intro: [
        "口コミや広告ではなく、インタラクティブ地図と同じ公開データ指標で順位を算出しています。",
        "地図では実際の目的地、家賃の基準、治安・価格・生活利便性の重みを自分の条件に合わせて変更できます。",
      ],
      faqs: [
        {
          question: "この順位はどのように計算していますか？",
          answer:
            "家賃の実取引、治安指標、生活利便施設の密度、交通アクセスから算出し、対象556行政洞の中で相対的に順位付けしています。",
        },
        {
          question: "勤務先や予算を自分で設定できますか？",
          answer:
            "はい。地図で最大3か所の目的地、通勤時間、家賃上限を設定し、各評価軸の重みも調整できます。",
        },
      ],
    };
  }

  const commute = area.group === "commute";
  return {
    keyword,
    title: `${keyword}｜家賃・治安・通勤を比較`,
    seoDescription: commute
      ? `${name}への通勤候補を、推定通勤時間・実取引家賃・治安・生活利便性で比較します。`
      : `${name}の街を、実取引家賃・治安・生活利便性・駅アクセスで比較します。`,
    h1: commute ? `${name}へ通勤するなら、どこに住む？` : `${name}では、どの街に住む？`,
    intro: commute
      ? [
          `よく知られた地域名だけでは、玄関から${name}までの通勤時間は分かりません。駅までのアクセス、地下鉄、徒歩、利用可能なバス区間を合わせて候補地域を比較します。`,
          "下の数値は地図と同じ家賃・治安・生活利便性データです。会社や学校の正確な住所を入力すると、自分専用の結果を確認できます。",
        ]
      : [
          `${name}の中でも、家賃、駅アクセス、治安指標、日常の利便性は地域ごとに異なります。同じ実測基準で比較しました。`,
          "インタラクティブ地図で勤務先や学校、通勤時間、家賃予算を設定すると、自分の条件に合う街を探せます。",
        ],
    faqs: [
      {
        question: commute ? `${name}周辺の正確な住所を入力できますか？` : `${name}からの通勤を比較できますか？`,
        answer:
          "はい。会社・学校・駅・住所を検索し、各地域からの地下鉄・徒歩・利用可能なバスアクセスを合わせた推定時間を確認できます。",
      },
      {
        question: "表示される家賃は何を基準にしていますか？",
        answer:
          "既定値は2023～2025年の新規契約に基づく小型の戸建て・多世帯住宅の保証金換算家賃中央値です。アプリでは住宅タイプと計算方法を変更できます。",
      },
    ],
  };
}

export function localizeAreaDef(area: AreaDef, locale: Locale): AreaDef {
  if (locale === "ko") return area;
  const name = AREA_NAMES[area.slug]?.[locale] ?? area.keyword;
  const copy = locale === "en" ? englishCopy(area, name) : japaneseCopy(area, name);
  return {
    ...area,
    ...copy,
    anchor: area.anchor
      ? { ...area.anchor, name: localizeAnchorName(area.anchor.name, locale) }
      : undefined,
  };
}

export function localizedAreaDefs(areas: AreaDef[], locale: Locale): AreaDef[] {
  return areas.map((area) => localizeAreaDef(area, locale));
}
