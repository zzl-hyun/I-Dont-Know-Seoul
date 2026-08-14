/**
 * Oneday API Worker.
 *
 * 의도적으로 얇게 유지한다. 무거운 계산(Dijkstra, 등급 산정)은 전부 브라우저에서
 * 돌고, 데이터 생성은 오프라인 스크립트가 한다. Worker가 하는 일은 두 가지뿐:
 *
 *   1. 지오코딩 프록시 — Kakao REST 키를 클라이언트에 노출하지 않기 위해
 *   2. 데이터 스냅샷 서빙 — KV에 있으면 KV, 없으면 정적 자산
 *
 * 무료 플랜의 요청당 CPU 10ms 제한이 있어서, JSON을 파싱하지 않고
 * 스트림째 흘려보내는 경로를 유지하는 게 중요하다.
 */

export interface Env {
  ASSETS: Fetcher;
  ONEDAY_KV: KVNamespace;
  /** wrangler secret put KAKAO_REST_KEY — 없으면 지하철역 검색으로 폴백 */
  KAKAO_REST_KEY?: string;
}

const KV_BUNDLE_KEY = "bundle:current";
const GEO_CACHE_TTL_SEC = 60 * 60 * 24 * 30; // 30일
/** 검색 범위 정책이 바뀌면 올려서 이전 정책의 캐시를 즉시 우회한다 */
const GEO_CACHE_VERSION = "v2";
const DATA_MAX_AGE_SEC = 60 * 60; // 1시간

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/data") return await handleData(request, env);
      if (url.pathname === "/api/geocode") return await handleGeocode(request, env, ctx);
    } catch (err) {
      console.error("[Worker] request failed", {
        method: request.method,
        path: url.pathname,
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
      return json({ error: "서버 내부 오류가 발생했습니다" }, 500);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

/* ------------------------------------------------------------------ */
/* /api/data — 동 메타 + 지하철 그래프 + 평판 점수 번들                   */
/* ------------------------------------------------------------------ */

async function handleData(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return json({ error: "GET만 지원합니다" }, 405, { Allow: "GET" });

  /*
   * 여기에 Worker 측 Cache API 계층을 두지 않는다.
   *
   * 두면 KV 읽기는 아끼지만, KV를 새로 시드해도 캐시가 만료될 때까지(최대 1시간)
   * 옛 데이터가 계속 나간다 — "재배포 없이 데이터 갱신"이라는 KV를 쓴 이유 자체가
   * 무너진다. KV 무료 한도가 10만 read/일이고 브라우저가 Cache-Control로 1시간
   * 캐싱하므로, 요청당 KV 1회 읽기는 충분히 감당된다.
   */

  // KV에 스냅샷이 있으면 그걸 쓴다 → 데이터 갱신 시 재배포가 필요 없다.
  // 스트림으로 받아 파싱하지 않고 그대로 흘려보낸다 (CPU 절약).
  const fromKv = await env.ONEDAY_KV.get(KV_BUNDLE_KEY, "stream");

  if (fromKv) {
    return new Response(fromKv, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${DATA_MAX_AGE_SEC}`,
        "X-Oneday-Source": "kv",
      },
    });
  }

  // KV가 비어 있으면(로컬 개발, 최초 배포) 정적 자산으로 폴백한다.
  const assetUrl = new URL("/data/bundle.json", request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }));
  if (!asset.ok) {
    return json(
      {
        error:
          "데이터 번들을 찾을 수 없습니다. `npm run data:boundaries && npm run data:subway && npm run data:metrics && npm run data:score` 를 먼저 실행하세요.",
      },
      503
    );
  }
  return new Response(asset.body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${DATA_MAX_AGE_SEC}`,
      "X-Oneday-Source": "assets",
    },
  });
}

/* ------------------------------------------------------------------ */
/* /api/geocode — 주소·장소 → 좌표                                      */
/* ------------------------------------------------------------------ */

interface GeoResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  kind: "station" | "place";
}

/** 이 이상은 실제 회사·주소명이 아니라 남용성 요청으로 본다 */
const MAX_QUERY_LEN = 100;
/** Kakao 요청이 이보다 오래 걸리면 포기하고 역명 검색으로 넘어간다 */
const KAKAO_TIMEOUT_MS = 5000;
/** 백령도부터 경기 동부까지 포함한 수도권 검색 사각형 (서경도, 남위도, 동경도, 북위도) */
const CAPITAL_AREA_RECT = "124.5,36.8,128.0,38.4";
/** 기존 UI가 한 번에 받던 결과 수(장소 5 + 주소 3)를 유지한다 */
const MAX_GEO_RESULTS = 8;

async function handleGeocode(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== "GET") return json({ error: "GET만 지원합니다" }, 405, { Allow: "GET" });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > MAX_QUERY_LEN) return json({ results: [] });

  const cacheKey = `geo:${GEO_CACHE_VERSION}:${q.toLowerCase()}`;
  const cached = await env.ONEDAY_KV.get(cacheKey, "text");
  if (cached) {
    const cachedPayload = parseGeoPayload(cached);
    if (cachedPayload) return json(cachedPayload, 200, { "X-Oneday-Geocode": "kv-hit" });
  }

  let results: GeoResult[] = [];
  let source = "station";

  if (env.KAKAO_REST_KEY) {
    results = await kakaoSearch(q, env.KAKAO_REST_KEY);
    source = "kakao";
  }

  // Kakao 키가 없거나 결과가 없으면 지하철역 이름으로 폴백한다.
  // 개발 환경에서도 앱이 동작하게 만들고, "강남역" 같은 입력을 빠르게 처리한다.
  if (results.length === 0) {
    results = await searchStations(q, env, request);
    // 헤더 값은 HTTP ByteString이어야 하므로 유니코드 화살표를 쓰지 않는다.
    source = env.KAKAO_REST_KEY ? "kakao-empty-station" : "station";
  }

  const payload = { results };
  if (results.length > 0) {
    ctx.waitUntil(
      env.ONEDAY_KV.put(cacheKey, JSON.stringify(payload), {
        expirationTtl: GEO_CACHE_TTL_SEC,
      })
    );
  }
  return json(payload, 200, { "X-Oneday-Geocode": source });
}

interface KakaoDoc {
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  address?: KakaoAddress;
  road_address?: KakaoAddress;
  x: string;
  y: string;
}

interface KakaoAddress {
  region_1depth_name?: string;
}

function isGeoResult(value: unknown): value is GeoResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.name === "string" &&
    typeof result.address === "string" &&
    Number.isFinite(result.lat) &&
    Number.isFinite(result.lng) &&
    (result.kind === "station" || result.kind === "place")
  );
}

function parseGeoPayload(raw: string): { results: GeoResult[] } | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const results = (value as { results?: unknown }).results;
    if (!Array.isArray(results) || !results.every(isGeoResult)) return null;
    return { results };
  } catch {
    return null;
  }
}

interface RankedGeoResult {
  result: GeoResult;
  /** 서울 0, 경기·인천 1 — 카카오 정확도 순서는 같은 rank 안에서 유지한다 */
  regionRank: number;
  sourceOrder: number;
}

async function kakaoSearch(q: string, key: string): Promise<GeoResult[]> {
  const headers = { Authorization: `KakaoAK ${key}` };
  const keywordParams = new URLSearchParams({
    query: q,
    size: "15",
    rect: CAPITAL_AREA_RECT,
  });
  const addressParams = new URLSearchParams({ query: q, size: "3" });

  // 장소(키워드) 검색을 먼저 한다 — "삼성전자 서초사옥", "서울대학교" 처럼
  // 회사·학교 이름으로 찾는 것이 이 서비스의 주 사용 방식이기 때문이다.
  //
  // allSettled를 쓴다 — 예전엔 Promise.all이라 둘 중 하나만 네트워크
  // 오류를 던져도 검색 전체가 500으로 죽었다. 타임아웃도 걸어서 Kakao가
  // 느려도 지하철역 폴백으로 넘어갈 수 있게 한다.
  const [placeResult, addrResult] = await Promise.allSettled([
    fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?${keywordParams}`,
      { headers, signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS) }
    ),
    fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?${addressParams}`,
      { headers, signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS) }
    ),
  ]);

  const out: RankedGeoResult[] = [];
  let sourceOrder = 0;

  if (placeResult.status === "fulfilled" && placeResult.value.ok) {
    for (const d of await readKakaoDocuments(placeResult.value)) {
      const regionRank = kakaoRegionRank(d);
      if (regionRank === null) continue;
      out.push({
        result: {
          name: d.place_name ?? q,
          address: d.road_address_name || d.address_name || "",
          lat: Number(d.y),
          lng: Number(d.x),
          kind: "place",
        },
        regionRank,
        sourceOrder: sourceOrder++,
      });
    }
  }

  if (addrResult.status === "fulfilled" && addrResult.value.ok) {
    for (const d of await readKakaoDocuments(addrResult.value)) {
      const regionRank = kakaoRegionRank(d);
      if (regionRank === null) continue;
      out.push({
        result: {
          name: d.address_name ?? q,
          address: d.address_name ?? "",
          lat: Number(d.y),
          lng: Number(d.x),
          kind: "place",
        },
        regionRank,
        sourceOrder: sourceOrder++,
      });
    }
  }

  return out
    .filter(({ result }) => Number.isFinite(result.lat) && Number.isFinite(result.lng))
    .sort((a, b) => a.regionRank - b.regionRank || a.sourceOrder - b.sourceOrder)
    .slice(0, MAX_GEO_RESULTS)
    .map(({ result }) => result);
}

async function readKakaoDocuments(response: Response): Promise<KakaoDoc[]> {
  try {
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return [];
    const documents = (data as { documents?: unknown }).documents;
    if (!Array.isArray(documents)) return [];
    return documents
      .map(normalizeKakaoDoc)
      .filter((doc): doc is KakaoDoc => doc !== null);
  } catch {
    return [];
  }
}

function normalizeKakaoDoc(value: unknown): KakaoDoc | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Record<string, unknown>;
  if (typeof doc.x !== "string" || typeof doc.y !== "string") return null;
  return {
    place_name: typeof doc.place_name === "string" ? doc.place_name : undefined,
    address_name: typeof doc.address_name === "string" ? doc.address_name : undefined,
    road_address_name:
      typeof doc.road_address_name === "string" ? doc.road_address_name : undefined,
    address: normalizeKakaoAddress(doc.address),
    road_address: normalizeKakaoAddress(doc.road_address),
    x: doc.x,
    y: doc.y,
  };
}

function normalizeKakaoAddress(value: unknown): KakaoAddress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const region = (value as Record<string, unknown>).region_1depth_name;
  return typeof region === "string" ? { region_1depth_name: region } : undefined;
}

/** 주소 문자열과 상세 지역 필드를 함께 봐서 수도권 여부와 서울 우선순위를 정한다 */
function kakaoRegionRank(d: KakaoDoc): number | null {
  const candidates = [
    d.road_address?.region_1depth_name,
    d.address?.region_1depth_name,
    d.road_address_name,
    d.address_name,
  ];

  for (const value of candidates) {
    const region = value?.trim();
    if (!region) continue;
    if (region.startsWith("서울")) return 0;
    if (region.startsWith("경기") || region.startsWith("인천")) return 1;
  }
  return null;
}

/* --- 지하철역 폴백 --- */

interface StationLite {
  name: string;
  lat: number;
  lng: number;
  lines: string[];
}

/**
 * isolate 수명 동안 재사용한다 (요청마다 번들을 다시 읽지 않기 위해).
 * TTL을 두는 이유: isolate는 여러 요청에 걸쳐 오래 살 수 있는데, 그동안
 * npm run data:seed로 KV 데이터만 갱신(재배포 없이)하면 이 캐시가 새
 * 역 정보를 못 보고 낡은 걸 계속 준다. /api/data 는 매 요청 KV를 새로
 * 읽어서 이 문제가 없지만, 이건 지오코딩 폴백(Kakao 키 없거나 결과
 * 0건일 때만 타는 경로)이라 완전 실시간 반영보다는 유한한 지연을
 * 받아들이는 쪽을 택했다.
 */
let stationCache: StationLite[] | null = null;
let stationCacheAt = 0;
const STATION_CACHE_TTL_MS = 10 * 60 * 1000; // 10분

async function searchStations(
  q: string,
  env: Env,
  request: Request
): Promise<GeoResult[]> {
  const stations = await getStations(env, request);
  const needle = q.replace(/역$/, "");
  if (!needle) return [];

  const scored = stations
    .map((s) => {
      let rank = -1;
      if (s.name === needle) rank = 0;
      else if (s.name.startsWith(needle)) rank = 1;
      else if (s.name.includes(needle)) rank = 2;
      return { s, rank };
    })
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.s.name.length - b.s.name.length)
    .slice(0, 6);

  return scored.map(({ s }) => ({
    name: `${s.name}역`,
    address: s.lines.join(" · "),
    lat: s.lat,
    lng: s.lng,
    kind: "station" as const,
  }));
}

async function getStations(env: Env, request: Request): Promise<StationLite[]> {
  if (stationCache && Date.now() - stationCacheAt < STATION_CACHE_TTL_MS) return stationCache;

  let text = await env.ONEDAY_KV.get(KV_BUNDLE_KEY, "text");
  if (!text) {
    const assetUrl = new URL("/data/bundle.json", request.url);
    const res = await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }));
    if (!res.ok) return [];
    text = await res.text();
  }

  try {
    const bundle = JSON.parse(text) as {
      graph?: { stations?: StationLite[] };
    };
    stationCache = bundle.graph?.stations ?? [];
  } catch {
    stationCache = [];
  }
  stationCacheAt = Date.now();
  return stationCache;
}

/* ------------------------------------------------------------------ */

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}
