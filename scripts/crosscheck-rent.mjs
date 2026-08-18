/**
 * 월세 중앙값을 한국부동산원(R-ONE) 통계와 대조한다. 파이프라인이 아니라
 * 일회성 검증 스크립트다 — `calibrate-walk.mjs` 와 같은 성격이라 결과는
 * 사람이 읽고 판단하며, 어떤 산출물도 자동으로 고치지 않는다.
 *
 * 왜 필요한가: 실거래가에는 공공임대(행복주택·LH·주공임대)가 일반 계약과
 * 섞여 들어오고, 대단지가 소형 평형 표본을 통째로 지배할 수 있다. 그러면
 * 중앙값이 "결측" 이 아니라 "아주 싼 동네" 로 나와서 어떤 검증에도 안 걸린다.
 * 실제로 판교 삼평동이 448건 중 79%가 공공임대라 31만원으로 나왔었고,
 * 동탄 신동은 93%였다. `isPublicRentalName()` 이 이름으로 거르지만 이름에
 * 표기가 없는 공공임대는 못 거른다 — 그 잔여 위험을 외부 통계로 잡는다.
 *
 * R-ONE 은 시군구가 최소 공표 단위라 행정동 지표를 대체할 수 없다. 대신
 * 표본이 민간 임대차 중심이라 공공임대 왜곡이 없어서 기준지로 쓴다.
 *
 *   npm run data:crosscheck-rent
 *
 * **성긴 그물이다.** 대조가 자치구 단위라, 구 전체가 눌린 경우만 잡힌다.
 * 실제로 걸러내기 전 데이터로 돌려보면 동탄(0.21)은 잡지만 분당(0.50)은
 * 통과한다 — 삼평동 31만·백현동 32만이 분당구 22개 동 중앙값에 묻히기
 * 때문이다. 여기서 정상이 떠도 "동 단위로 깨끗하다" 는 뜻은 아니다.
 * 동 단위까지 보려면 원 API 를 단지명째 받아 직접 세는 수밖에 없다.
 *
 * `REB_API_KEY` 가 없으면 R-ONE 이 응답을 5건으로 조용히 자른다(오류가 아니다).
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = join(ROOT, "public/data/bundle.json");

/** (월) 중위월세가격_아파트. 단위는 천원이고 규모를 안 가린다(전 규모). */
const STATBL_ID = "A_2024_00071";
const R_ONE_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do";
/** R-ONE 은 한 번에 1,000건까지만 준다. */
const PAGE_SIZE = 1000;
const START_WRTTIME = "202501";
const END_WRTTIME = "202512";

/**
 * 소형(10~60㎡) 중앙값 ÷ 전 규모 중앙값. 소형이 더 싸니 1보다 작은 게 정상이고,
 * 실측상 정상 자치구는 0.39~0.55 에 모인다. 이 아래로 떨어지면 표본이
 * 공공임대에 눌렸다는 신호다 — 걸러내기 전 동탄이 0.21 이었다.
 */
const RATIO_FLOOR = 0.3;

async function fetchROneMedians(key) {
  const byRegion = new Map();
  for (let pIndex = 1; ; pIndex++) {
    const url =
      `${R_ONE_URL}?STATBL_ID=${STATBL_ID}&DTACYCLE_CD=MM&Type=json` +
      `&START_WRTTIME=${START_WRTTIME}&END_WRTTIME=${END_WRTTIME}` +
      `&pIndex=${pIndex}&pSize=${PAGE_SIZE}${key ? `&Key=${encodeURIComponent(key)}` : ""}`;
    const payload = await (await fetch(url)).json();
    if (payload?.RESULT?.CODE && payload.RESULT.CODE !== "INFO-000") {
      throw new Error(`R-ONE 오류 ${payload.RESULT.CODE}: ${payload.RESULT.MESSAGE}`);
    }
    const rows = payload?.SttsApiTblData?.[1]?.row ?? [];
    for (const row of rows) {
      if (!String(row.CLS_FULLNM ?? "").startsWith("경기")) continue;
      const value = Number(row.DTA_VAL);
      if (!Number.isFinite(value)) continue;
      // 천원 → 만원
      if (!byRegion.has(row.CLS_NM)) byRegion.set(row.CLS_NM, []);
      byRegion.get(row.CLS_NM).push(value / 10);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  const out = new Map();
  for (const [name, values] of byRegion) {
    out.set(name, values.reduce((a, b) => a + b, 0) / values.length);
  }
  return out;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  const bundle = JSON.parse(await readFile(BUNDLE, "utf8"));
  const key = process.env.REB_API_KEY;
  if (!key) {
    console.warn("REB_API_KEY 가 없습니다 — R-ONE 이 응답을 5건으로 잘라 대조가 무의미해집니다.\n");
  }

  const rOne = await fetchROneMedians(key);

  // 서울은 R-ONE 이 자치구명을 그대로 쓰지만 우리 gu 이름과 겹치는 이름이
  // 많아(중구·동구 등) 경기만 대조한다. 서울은 공공임대 비중이 0.5%라
  // 애초에 이 검사의 대상이 아니다.
  const gyeonggi = bundle.dongs.filter((d) => !d.guCode.startsWith("11"));
  const byGu = new Map();
  for (const dong of gyeonggi) {
    const variant = bundle.scores[dong.code]?.rentVariants?.raw?.apartment;
    if (variant?.medianMan == null) continue;
    if (!byGu.has(dong.gu)) byGu.set(dong.gu, []);
    byGu.get(dong.gu).push(variant.medianMan);
  }

  console.log("자치구        소형(우리)  전규모(R-ONE)   비율   판정");
  let flagged = 0;
  for (const [gu, values] of [...byGu].sort()) {
    // "성남시 분당구" → "분당구". 화성시는 R-ONE 이 구를 안 나눠 시로 잡힌다.
    const leaf = gu.split(" ").at(-1);
    const reference = rOne.get(leaf) ?? rOne.get(gu.split(" ")[0]);
    const ours = median(values);
    if (reference == null || ours == null) {
      console.log(`${gu.padEnd(14)} ${String(ours ?? "—").padStart(8)}만   (R-ONE 대응 없음)`);
      continue;
    }
    const ratio = ours / reference;
    const bad = ratio < RATIO_FLOOR;
    if (bad) flagged++;
    console.log(
      `${gu.padEnd(14)} ${ours.toFixed(1).padStart(8)}만 ${reference.toFixed(1).padStart(11)}만 ` +
        `${ratio.toFixed(2).padStart(7)}   ${bad ? "⚠ 공공임대 잔류 의심" : "정상"}`
    );
  }

  console.log(
    `\n소형/전규모 비율이 ${RATIO_FLOOR} 미만인 자치구: ${flagged}개` +
      (flagged
        ? "\n→ 해당 구의 단지명을 열어 공공임대가 남아 있는지 확인하세요 (scripts/lib/rent.mjs 의 isPublicRentalName)."
        : "")
  );
}

await main();
