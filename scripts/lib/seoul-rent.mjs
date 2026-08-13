import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { unzipRaw } from "unzipit";
import {
  RENT_AREA_MAX_BY_TYPE,
  RENT_AREA_MIN,
  toConvertedMonthly,
} from "./rent.mjs";

export const SEOUL_RENT_START_DATE = "20230101";
export const SEOUL_RENT_END_DATE = "20251231";
export const SEOUL_RENT_ARCHIVE_YEARS = [2023, 2024, 2025];

const REQUIRED_HEADERS = [
  "접수년도",
  "자치구코드",
  "자치구명",
  "법정동코드",
  "법정동명",
  "지번구분코드",
  "지번구분",
  "본번",
  "부번",
  "층",
  "계약일",
  "전월세구분",
  "임대면적",
  "보증금(만원)",
  "임대료(만원)",
  "건물명",
  "건축년도",
  "건물용도",
  "계약기간",
  "신규계약구분",
  "갱신청구권사용",
  "종전보증금",
  "종전임대료",
];

export const SEOUL_BUILDING_TYPE = Object.freeze({
  단독다가구: "house",
  연립다세대: "rowhouse",
  오피스텔: "officetel",
  아파트: "apartment",
});

/**
 * 서울 열린데이터광장 연도별 ZIP을 읽어 집계에 바로 쓸 정규화 레코드로 만든다.
 * ZIP마다 파일 하나만 있어야 하며, 세 파일 사이의 중복도 같은 Set으로 제거한다.
 */
export async function loadSeoulRentArchives(
  archivePaths,
  { startDate = SEOUL_RENT_START_DATE, endDate = SEOUL_RENT_END_DATE } = {}
) {
  if (archivePaths.length !== SEOUL_RENT_ARCHIVE_YEARS.length) {
    throw new Error(
      `서울 전월세 ZIP은 ${SEOUL_RENT_ARCHIVE_YEARS.join(", ")}년 3개가 필요합니다 ` +
        `(받은 파일 ${archivePaths.length}개)`
    );
  }

  const records = [];
  const seen = new Set();
  const total = emptyStats(startDate, endDate);

  for (const path of archivePaths) {
    const compressed = await readFile(path);
    const { entries } = await unzipRaw(compressed);
    const files = entries.filter((entry) => !entry.isDirectory);
    if (files.length !== 1) {
      throw new Error(`${basename(path)} 안의 데이터 파일이 1개가 아닙니다 (${files.length}개)`);
    }
    if (files[0].encrypted) throw new Error(`${basename(path)}은 암호화된 ZIP이라 읽을 수 없습니다`);

    const bytes = new Uint8Array(await files[0].arrayBuffer());
    const result = parseSeoulRentLines(decodedLines(bytes), {
      sourceName: basename(path),
      startDate,
      endDate,
      seen,
    });
    for (const record of result.records) records.push(record);
    mergeStats(total, result.stats);
  }

  total.unique = records.length;
  return { records, stats: total };
}

/** 테스트와 ZIP 로더가 공유하는 CSV 행 집계기. */
export function parseSeoulRentLines(
  lines,
  {
    sourceName = "서울 전월세 CSV",
    startDate = SEOUL_RENT_START_DATE,
    endDate = SEOUL_RENT_END_DATE,
    seen = new Set(),
  } = {}
) {
  const iterator = lines[Symbol.iterator]();
  const first = iterator.next();
  if (first.done) throw new Error(`${sourceName}: CSV가 비어 있습니다`);

  const headers = parseCsvLine(first.value).map((v, i) => cleanCell(v, i === 0));
  const missing = REQUIRED_HEADERS.filter((name) => !headers.includes(name));
  if (missing.length) throw new Error(`${sourceName}: 필수 컬럼 누락 — ${missing.join(", ")}`);

  const index = Object.fromEntries(headers.map((name, i) => [name, i]));
  const identityIndexes = headers
    .map((name, i) => ({ name, i }))
    .filter(({ name }) => name !== "접수년도")
    .map(({ i }) => i);
  const records = [];
  const stats = emptyStats(startDate, endDate);
  stats.archives = [sourceName];

  let lineNo = 1;
  for (const line of iterator) {
    lineNo++;
    if (!line.trim()) continue;
    stats.rowsRead++;
    const values = parseCsvLine(line).map((v) => cleanCell(v));
    if (values.length !== headers.length) {
      throw new Error(
        `${sourceName}:${lineNo}: 컬럼 수가 다릅니다 (헤더 ${headers.length}, 행 ${values.length})`
      );
    }

    const contractDate = values[index["계약일"]];
    if (!/^\d{8}$/.test(contractDate) || contractDate < startDate || contractDate > endDate) continue;
    stats.inPeriod++;
    if (values[index["전월세구분"]] !== "월세") continue;
    if (values[index["신규계약구분"]] !== "신규") continue;

    const type = SEOUL_BUILDING_TYPE[values[index["건물용도"]]];
    if (!type) continue;
    const area = parseNumber(values[index["임대면적"]]);
    const deposit = parseNumber(values[index["보증금(만원)"]]);
    const monthly = parseNumber(values[index["임대료(만원)"]]);
    if (
      !Number.isFinite(area) ||
      !Number.isFinite(deposit) ||
      !Number.isFinite(monthly) ||
      area < RENT_AREA_MIN ||
      area > RENT_AREA_MAX_BY_TYPE[type] ||
      monthly <= 0
    ) {
      continue;
    }
    stats.eligible++;

    const guCode = values[index["자치구코드"]];
    const legalDongName = values[index["법정동명"]];
    if (!guCode || !legalDongName) {
      stats.invalidLocation++;
      continue;
    }

    // 접수년도는 같은 계약이 정정·재접수되며 달라질 수 있어 관측값 식별자에서 뺀다.
    // 층·면적·가격·계약일·계약기간 등 나머지 공개 필드가 하나라도 다르면 보존한다.
    const identity = identityIndexes.map((i) => values[i]).join("\u001f");
    if (seen.has(identity)) {
      stats.duplicates++;
      increment(stats.duplicatesByYear, contractDate.slice(0, 4));
      increment(stats.duplicatesByType, type);
      continue;
    }
    seen.add(identity);

    const record = {
      guCode,
      legalDongName,
      monthly,
      converted: toConvertedMonthly(deposit, monthly),
      type,
      contractDate,
    };
    records.push(record);
    increment(stats.uniqueByYear, contractDate.slice(0, 4));
    increment(stats.uniqueByType, type);
  }

  stats.unique = records.length;
  return { records, stats };
}

/** RFC 4180의 따옴표·이스케이프 따옴표를 처리하는 한 행 파서. */
export function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === "," && !quoted) {
      values.push(value);
      value = "";
      continue;
    }
    value += ch;
  }
  if (quoted) throw new Error("닫히지 않은 CSV 따옴표가 있습니다");
  values.push(value);
  return values;
}

function* decodedLines(bytes) {
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const decoder = new TextDecoder(utf8Bom ? "utf-8" : "euc-kr", { fatal: true });
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i !== bytes.length && bytes[i] !== 0x0a) continue;
    let end = i;
    if (end > start && bytes[end - 1] === 0x0d) end--;
    yield decoder.decode(bytes.subarray(start, end));
    start = i + 1;
  }
}

function cleanCell(value, first = false) {
  const cleaned = first ? value.replace(/^\ufeff/, "") : value;
  return cleaned.trim();
}

function parseNumber(value) {
  return Number(value.replaceAll(",", ""));
}

function emptyStats(startDate, endDate) {
  return {
    period: { startDate, endDate },
    archives: [],
    rowsRead: 0,
    inPeriod: 0,
    eligible: 0,
    invalidLocation: 0,
    duplicates: 0,
    unique: 0,
    uniqueByYear: {},
    uniqueByType: {},
    duplicatesByYear: {},
    duplicatesByType: {},
  };
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function mergeStats(target, source) {
  target.archives.push(...source.archives);
  for (const key of ["rowsRead", "inPeriod", "eligible", "invalidLocation", "duplicates"]) {
    target[key] += source[key];
  }
  for (const key of ["uniqueByYear", "uniqueByType", "duplicatesByYear", "duplicatesByType"]) {
    for (const [name, value] of Object.entries(source[key])) increment(target[key], name, value);
  }
}
