import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadSeoulRentArchives,
  parseCsvLine,
  parseSeoulRentLines,
  SEOUL_RENT_ARCHIVE_YEARS,
} from "./seoul-rent.mjs";
import { rentConversionRate } from "./rent.mjs";

const HEADERS = [
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

const base = {
  접수년도: "2023",
  자치구코드: "11710",
  자치구명: "송파구",
  법정동코드: "10800",
  법정동명: "문정동",
  지번구분코드: "1",
  지번구분: "대지",
  본번: "0012",
  부번: "0003",
  층: "3",
  계약일: "20230501",
  전월세구분: "월세",
  임대면적: "25",
  "보증금(만원)": "1000",
  "임대료(만원)": "50",
  건물명: "문정,빌라",
  건축년도: "2020",
  건물용도: "연립다세대",
  계약기간: "23.05~25.05",
  신규계약구분: "신규",
  갱신청구권사용: "",
  종전보증금: "",
  종전임대료: "",
};

function csvRow(overrides = {}) {
  const row = { ...base, ...overrides };
  return HEADERS.map((name) => quote(row[name] ?? "")).join(",");
}

function quote(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

describe("서울 전월세 CSV 파서", () => {
  it("쉼표와 이스케이프 따옴표가 든 셀을 보존한다", () => {
    expect(parseCsvLine('"문정,빌라","A""동",3')).toEqual(["문정,빌라", 'A"동', "3"]);
  });

  it("3개년 신규 월세·면적 기준만 남기고 환산월세를 계산한다", () => {
    const lines = [
      HEADERS.map(quote).join(","),
      csvRow(),
      csvRow({ 층: "4", 건물용도: "단독다가구" }),
      csvRow({ 층: "5", 건물용도: "아파트", 임대면적: "59.9" }),
      csvRow({ 층: "6", 건물용도: "아파트", 임대면적: "60.1" }),
      csvRow({ 층: "7", 신규계약구분: "갱신" }),
      csvRow({ 층: "8", 전월세구분: "전세", "임대료(만원)": "0" }),
      csvRow({ 층: "9", 계약일: "20221231" }),
    ];
    const { records, stats } = parseSeoulRentLines(lines);

    expect(records.map((r) => r.type)).toEqual(["rowhouse", "house", "apartment"]);
    expect(records[0].monthly).toBe(50);
    // 환산월세는 유형·자치구별 전환율을 쓴다 — 서울 연립·다세대는 4.68%.
    expect(records[0].converted).toBeCloseTo(
      50 + (1_000 * rentConversionRate("rowhouse", records[0].guCode)) / 12,
      4
    );
    expect(stats.unique).toBe(3);
  });

  it("접수년도만 다른 동일 계약은 하나로 합치고 층이 다르면 보존한다", () => {
    const lines = [
      HEADERS.map(quote).join(","),
      csvRow(),
      csvRow({ 접수년도: "2024" }),
      csvRow({ 접수년도: "2024", 층: "4" }),
    ];
    const { records, stats } = parseSeoulRentLines(lines);

    expect(records).toHaveLength(2);
    expect(stats.eligible).toBe(3);
    expect(stats.duplicates).toBe(1);
  });

  it("필수 헤더가 없으면 부분 데이터로 진행하지 않는다", () => {
    expect(() => parseSeoulRentLines(["계약일,전월세구분", "20250101,월세"])).toThrow(
      /필수 컬럼 누락/
    );
  });
});

const rawRoot = join(process.cwd(), "data/raw/seoul_rent");
const archivePaths = SEOUL_RENT_ARCHIVE_YEARS.map((year) => {
  for (const extension of [".zip", ".csv"]) {
    const path = join(rawRoot, `seoul_rent_${year}${extension}`);
    if (existsSync(path)) return path;
  }
  return join(rawRoot, `seoul_rent_${year}.zip`);
});
const hasRawSources = archivePaths.every(existsSync);

describe.runIf(hasRawSources)("서울 전월세 원본 3개년 통합", () => {
  it(
    "현재 스냅샷에서 위치가 있는 신규 소형 월세 516,349건을 중복·공공임대 없이 만든다",
    async () => {
      const { records, stats } = await loadSeoulRentArchives(archivePaths);

      expect(records).toHaveLength(516_349);
      expect(stats.duplicates).toBe(150_582);
      expect(stats.invalidLocation).toBe(2);
      // 공공임대는 중복 제거 뒤에 걸러서 duplicates 를 흔들지 않는다.
      // 서울은 2,827건(0.5%)뿐이라 동별 중앙값이 뒤집히는 곳은 없었다 —
      // 이 지표가 실제로 문제였던 건 경기(판교·광교)다.
      expect(stats.publicRental).toBe(2_827);
      expect(stats.uniqueByType).toEqual({
        house: 192_046,
        rowhouse: 98_403,
        officetel: 113_622,
        apartment: 112_278,
      });
      expect(stats.uniqueByYear).toEqual({
        "2023": 141_816,
        "2024": 179_084,
        "2025": 195_449,
      });
    },
    120_000
  );
});
