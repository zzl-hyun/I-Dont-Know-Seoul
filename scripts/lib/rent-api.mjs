import {
  RENT_AREA_MAX_BY_TYPE,
  RENT_AREA_MIN,
  isPublicRentalName,
  toConvertedMonthly,
} from "./rent.mjs";

/**
 * 단지명 필드 이름이 엔드포인트마다 다르다. 단독·다가구(SHRent)는 단지가
 * 아니라 개별 주택이라 이름 필드 자체가 없다 — 거를 것도 없으므로 빠져 있다.
 */
const COMPLEX_NAME_FIELD = Object.freeze({
  rowhouse: "mhouseNm",
  officetel: "offiNm",
  apartment: "aptNm",
});

export function contractMonths(startDate, endDate) {
  const startYear = Number(startDate.slice(0, 4));
  const startMonth = Number(startDate.slice(4, 6));
  const endYear = Number(endDate.slice(0, 4));
  const endMonth = Number(endDate.slice(4, 6));
  const out = [];
  for (let year = startYear; year <= endYear; year++) {
    const from = year === startYear ? startMonth : 1;
    const to = year === endYear ? endMonth : 12;
    for (let month = from; month <= to; month++) {
      out.push(`${year}${String(month).padStart(2, "0")}`);
    }
  }
  return out;
}

/**
 * 시군구·계약월·주택유형 한 묶음을 마지막 페이지까지 받은 뒤 정규화한다.
 * 중간 페이지가 실패하면 부분 레코드를 반환하지 않는다.
 */
export async function fetchPaginatedRentJob({
  key,
  gu,
  ym,
  endpoint,
  fetchImpl = fetch,
  sleep = defaultSleep,
  maxRetry = 4,
}) {
  let calls = 0;

  const fetchPage = async (pageNo) => {
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** attempt);
      try {
        const url =
          `${endpoint.url}?serviceKey=${encodeURIComponent(key)}` +
          `&LAWD_CD=${gu}&DEAL_YMD=${ym}&numOfRows=1000&pageNo=${pageNo}&_type=json`;
        calls++;
        const res = await fetchImpl(url);
        const text = await res.text();
        let response;
        try {
          response = JSON.parse(text)?.response;
        } catch {
          continue;
        }
        if (response?.header?.resultCode !== "000") continue;
        return response.body ?? {};
      } catch {
        // 네트워크 오류도 같은 백오프 경로로 재시도한다.
      }
    }
    throw new Error(
      `${gu} ${ym} ${endpoint.name} ${pageNo}페이지를 ${maxRetry + 1}회 시도했지만 실패했습니다`
    );
  };

  const first = await fetchPage(1);
  const totalCount = Number(first.totalCount ?? 0);
  if (!Number.isInteger(totalCount) || totalCount < 0) {
    throw new Error(`${gu} ${ym} ${endpoint.name} totalCount가 올바르지 않습니다`);
  }
  const pageCount = Math.max(1, Math.ceil(totalCount / 1000));
  const items = [...[].concat(first.items?.item ?? [])];
  for (let pageNo = 2; pageNo <= pageCount; pageNo++) {
    const page = await fetchPage(pageNo);
    items.push(...[].concat(page.items?.item ?? []));
  }
  if (items.length < totalCount) {
    throw new Error(
      `${gu} ${ym} ${endpoint.name} 응답이 일부만 왔습니다 (${items.length}/${totalCount})`
    );
  }

  const records = [];
  const nameField = COMPLEX_NAME_FIELD[endpoint.name];
  let publicRental = 0;
  for (const item of items) {
    if (String(item.contractType ?? "").trim() !== "신규") continue;
    const area = parseNumber(item.excluUseAr ?? item.totalFloorAr ?? 0);
    if (!(area >= RENT_AREA_MIN && area <= RENT_AREA_MAX_BY_TYPE[endpoint.name])) continue;
    const deposit = parseNumber(item.deposit ?? 0);
    const monthly = parseNumber(item.monthlyRent ?? 0);
    if (!Number.isFinite(deposit) || !(monthly > 0)) continue;
    const legal = String(item.umdNm ?? "").trim();
    if (!legal) continue;
    if (nameField && isPublicRentalName(item[nameField])) {
      publicRental++;
      continue;
    }
    records.push({
      legal,
      monthly,
      converted: toConvertedMonthly(deposit, monthly),
      type: endpoint.name,
    });
  }

  return { records, calls, totalCount, pageCount, publicRental };
}

function parseNumber(value) {
  return Number(String(value).replace(/,/g, ""));
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
