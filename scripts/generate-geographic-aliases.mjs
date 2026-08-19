/**
 * Generate the checked-in EN/JA geographic alias catalogue from the current public bundle.
 *
 * Korean names remain canonical join keys. The generated file is presentation/search data
 * only, so rebuilding it cannot alter coordinates, graph ids, scoring, or route topology.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = join(ROOT, "public/data/bundle.json");
const OUTPUT = join(ROOT, "src/data/geographicAliases.ts");

const INITIAL_ROMAN = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
const VOWEL_ROMAN = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const FINAL_ROMAN = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "p", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "h",
];

const VOWEL_KANA = [
  "ア", "エ", "ヤ", "イェ", "オ", "エ", "ヨ", "イェ", "オ", "ワ", "ウェ", "ウェ", "ヨ", "ウ", "ウォ", "ウェ", "ウィ", "ユ", "ウ", "ウィ", "イ",
];
const KANA_ROWS = {
  k: ["カ", "ケ", "キャ", "キェ", "コ", "ケ", "キョ", "キェ", "コ", "クァ", "クェ", "クェ", "キョ", "ク", "クォ", "クェ", "クィ", "キュ", "ク", "クィ", "キ"],
  n: ["ナ", "ネ", "ニャ", "ニェ", "ノ", "ネ", "ニョ", "ニェ", "ノ", "ヌァ", "ヌェ", "ヌェ", "ニョ", "ヌ", "ヌォ", "ヌェ", "ヌィ", "ニュ", "ヌ", "ヌィ", "ニ"],
  t: ["タ", "テ", "ティャ", "ティェ", "ト", "テ", "ティョ", "ティェ", "ト", "トァ", "トェ", "トェ", "ティョ", "トゥ", "トォ", "トェ", "トゥィ", "テュ", "トゥ", "トゥィ", "ティ"],
  r: ["ラ", "レ", "リャ", "リェ", "ロ", "レ", "リョ", "リェ", "ロ", "ルァ", "ルェ", "ルェ", "リョ", "ル", "ルォ", "ルェ", "ルィ", "リュ", "ル", "ルィ", "リ"],
  m: ["マ", "メ", "ミャ", "ミェ", "モ", "メ", "ミョ", "ミェ", "モ", "ムァ", "ムェ", "ムェ", "ミョ", "ム", "ムォ", "ムェ", "ムィ", "ミュ", "ム", "ムィ", "ミ"],
  p: ["パ", "ペ", "ピャ", "ピェ", "ポ", "ペ", "ピョ", "ピェ", "ポ", "プァ", "プェ", "プェ", "ピョ", "プ", "プォ", "プェ", "プィ", "ピュ", "プ", "プィ", "ピ"],
  s: ["サ", "セ", "シャ", "シェ", "ソ", "セ", "ショ", "シェ", "ソ", "スァ", "スェ", "スェ", "ショ", "ス", "スォ", "スェ", "スィ", "シュ", "ス", "スィ", "シ"],
  j: ["ジャ", "ジェ", "ジャ", "ジェ", "ジョ", "ジェ", "ジョ", "ジェ", "ジョ", "ジュァ", "ジュェ", "ジュェ", "ジョ", "ジュ", "ジュォ", "ジュェ", "ジュィ", "ジュ", "ジュ", "ジュィ", "ジ"],
  ch: ["チャ", "チェ", "チャ", "チェ", "チョ", "チェ", "チョ", "チェ", "チョ", "チュァ", "チュェ", "チュェ", "チョ", "チュ", "チュォ", "チュェ", "チュィ", "チュ", "チュ", "チュィ", "チ"],
  h: ["ハ", "ヘ", "ヒャ", "ヒェ", "ホ", "ヘ", "ヒョ", "ヒェ", "ホ", "ファ", "フェ", "フェ", "ヒョ", "フ", "フォ", "フェ", "フィ", "ヒュ", "フ", "フィ", "ヒ"],
};
const INITIAL_KANA_ROW = [
  "k", "k", "n", "t", "t", "r", "m", "p", "p", "s", "s", "", "j", "j", "ch", "k", "t", "p", "h",
];
const FINAL_KANA = [
  "", "ク", "ク", "ク", "ン", "ン", "ン", "ッ", "ル", "ク", "ム", "プ", "ル", "ル", "プ", "ル", "ム", "プ", "プ", "ッ", "ッ", "ン", "ッ", "ッ", "ク", "ッ", "プ", "ッ",
];

const ENGLISH_OVERRIDES = {
  서울: "Seoul",
  강남: "Gangnam",
  판교: "Pangyo",
  수원: "Suwon",
  성남: "Seongnam",
  용인: "Yongin",
  화성: "Hwaseong",
  동탄: "Dongtan",
  광교: "Gwanggyo",
  신림: "Sillim",
  신림동: "Sillim-dong",
  종로: "Jongno",
  종로구: "Jongno-gu",
  신촌: "Sinchon",
  홍대입구: "Hongik Univ.",
  건대입구: "Konkuk Univ.",
  교대: "Seoul Nat'l Univ. of Education",
  서울대입구: "Seoul Nat'l Univ.",
  성신여대입구: "Sungshin Women's Univ.",
  숙대입구: "Sookmyung Women's Univ.",
  이대: "Ewha Womans Univ.",
  한양대: "Hanyang Univ.",
  고려대: "Korea Univ.",
  외대앞: "Hankuk Univ. of Foreign Studies",
  총신대입구: "Chongshin Univ.",
  고속터미널: "Express Bus Terminal",
  시청: "City Hall",
  회현: "Hoehyeon",
  이촌: "Ichon",
  녹사평: "Noksapyeong",
  압구정로데오: "Apgujeong Rodeo",
  디지털미디어시티: "Digital Media City",
  가산디지털단지: "Gasan Digital Complex",
  구로디지털단지: "Guro Digital Complex",
  동대문역사문화공원: "Dongdaemun History & Culture Park",
  공항화물청사: "Airport Cargo Terminal",
  인천공항1터미널: "Incheon Int'l Airport Terminal 1",
  인천공항2터미널: "Incheon Int'l Airport Terminal 2",
  김포공항: "Gimpo Int'l Airport",
};

const JAPANESE_OVERRIDES = {
  서울: "ソウル",
  강남: "カンナム",
  판교: "パンギョ",
  수원: "スウォン",
  성남: "ソンナム",
  용인: "ヨンイン",
  화성: "ファソン",
  동탄: "トンタン",
  광교: "クァンギョ",
  신림: "シンリム",
  종로: "チョンノ",
  신촌: "シンチョン",
  홍대입구: "ホンデイック",
  건대입구: "コンデイック",
  교대: "キョデ",
  서울대입구: "ソウルデイック",
  고속터미널: "高速ターミナル",
  시청: "市庁",
  디지털미디어시티: "デジタルメディアシティ",
  가산디지털단지: "カサンデジタル団地",
  구로디지털단지: "クロデジタル団地",
  동대문역사문화공원: "東大門歴史文化公園",
  김포공항: "金浦空港",
};

const LINE_ALIASES = {
  "1": { en: "Line 1", ja: "1号線" },
  "2": { en: "Line 2", ja: "2号線" },
  "3": { en: "Line 3", ja: "3号線" },
  "4": { en: "Line 4", ja: "4号線" },
  "5": { en: "Line 5", ja: "5号線" },
  "6": { en: "Line 6", ja: "6号線" },
  "7": { en: "Line 7", ja: "7号線" },
  "8": { en: "Line 8", ja: "8号線" },
  "9": { en: "Line 9", ja: "9号線" },
  "GTX-A": { en: "GTX-A", ja: "GTX-A" },
  I2: { en: "Incheon Line 2", ja: "仁川2号線" },
  Silim: { en: "Sillim Line", ja: "新林線" },
  W: { en: "Ui–Sinseol Line", ja: "牛耳新設線" },
  경강: { en: "Gyeonggang Line", ja: "京江線" },
  "경의·중앙": { en: "Gyeongui–Jungang Line", ja: "京義・中央線" },
  경춘: { en: "Gyeongchun Line", ja: "京春線" },
  공항철도: { en: "Airport Railroad", ja: "空港鉄道" },
  "김포 골드라인": { en: "Gimpo Goldline", ja: "金浦ゴールドライン" },
  서해: { en: "SeoHae Line", ja: "西海線" },
  "수인·분당": { en: "Suin–Bundang Line", ja: "水仁・盆唐線" },
  신분당: { en: "Shinbundang Line", ja: "新盆唐線" },
  인천1: { en: "Incheon Line 1", ja: "仁川1号線" },
};

function decompose(char) {
  const code = char.codePointAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  const offset = code - 0xac00;
  return {
    initial: Math.floor(offset / 588),
    vowel: Math.floor((offset % 588) / 28),
    final: offset % 28,
  };
}

function romanize(input) {
  let result = "";
  for (const char of input.normalize("NFC")) {
    const syllable = decompose(char);
    if (!syllable) {
      result += char;
      continue;
    }
    result +=
      INITIAL_ROMAN[syllable.initial] +
      VOWEL_ROMAN[syllable.vowel] +
      FINAL_ROMAN[syllable.final];
  }
  return result;
}

function toKatakana(input) {
  let result = "";
  for (const char of input.normalize("NFC")) {
    const syllable = decompose(char);
    if (!syllable) {
      result += char;
      continue;
    }
    const row = INITIAL_KANA_ROW[syllable.initial];
    const core = row ? KANA_ROWS[row][syllable.vowel] : VOWEL_KANA[syllable.vowel];
    result += core + FINAL_KANA[syllable.final];
  }
  return result;
}

function titleCase(value) {
  return value
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/(^|[\s·/()-])([a-z])/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`);
}

function englishName(raw) {
  if (ENGLISH_OVERRIDES[raw]) return ENGLISH_OVERRIDES[raw];
  return raw
    .split(" ")
    .map((part) => {
      const override = ENGLISH_OVERRIDES[part];
      if (override) return override;
      const suffix = part.endsWith("동")
        ? "-dong"
        : part.endsWith("구")
          ? "-gu"
          : part.endsWith("시")
            ? "-si"
            : "";
      const stem = suffix ? part.slice(0, -1) : part;
      return `${titleCase(romanize(stem))}${suffix}`;
    })
    .join(" ");
}

function japaneseName(raw) {
  if (JAPANESE_OVERRIDES[raw]) return JAPANESE_OVERRIDES[raw];
  return raw
    .split(" ")
    .map((part) => {
      const override = JAPANESE_OVERRIDES[part];
      if (override) return override;
      const suffix = part.endsWith("동")
        ? "洞"
        : part.endsWith("구")
          ? "区"
          : part.endsWith("시")
            ? "市"
            : "";
      const stem = suffix ? part.slice(0, -1) : part;
      return `${toKatakana(stem)}${suffix}`;
    })
    .join(" ");
}

function alias(raw) {
  return { en: englishName(raw), ja: japaneseName(raw) };
}

function sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b, "ko")));
}

async function main() {
  const bundle = JSON.parse(await readFile(INPUT, "utf8"));
  const dongs = sortedObject(bundle.dongs.map((dong) => [dong.code, alias(dong.dong)]));
  const fullDongs = sortedObject(bundle.dongs.map((dong) => [dong.code, alias(dong.name)]));
  const districts = sortedObject(
    [...new Set(bundle.dongs.map((dong) => dong.gu))].map((name) => [name, alias(name)])
  );
  const stations = sortedObject(
    [...new Set(bundle.graph.stations.map((station) => station.name))].map((name) => [name, alias(name)])
  );
  const lines = sortedObject(
    [...new Set(bundle.graph.nodes.map((node) => node.line))].map((name) => [
      name,
      LINE_ALIASES[name] ?? alias(name),
    ])
  );

  const source = `/** Generated by scripts/generate-geographic-aliases.mjs. */
export interface GeographicAlias {
  en: string;
  ja: string;
}

export const DONG_ALIASES: Record<string, GeographicAlias> = ${JSON.stringify(dongs, null, 2)};

export const FULL_DONG_ALIASES: Record<string, GeographicAlias> = ${JSON.stringify(fullDongs, null, 2)};

export const DISTRICT_ALIASES: Record<string, GeographicAlias> = ${JSON.stringify(districts, null, 2)};

export const STATION_ALIASES: Record<string, GeographicAlias> = ${JSON.stringify(stations, null, 2)};

export const LINE_ALIASES: Record<string, GeographicAlias> = ${JSON.stringify(lines, null, 2)};
`;

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, source, "utf8");
  console.log(
    `Geographic aliases: ${Object.keys(dongs).length} dongs, ${Object.keys(districts).length} districts, ${Object.keys(stations).length} stations, ${Object.keys(lines).length} lines`
  );
}

await main();
