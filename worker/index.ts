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
const DATA_MAX_AGE_SEC = 60 * 60; // 1시간

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/data") return await handleData(request, env);
      if (url.pathname === "/api/geocode") return await handleGeocode(request, env, ctx);
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

/* ------------------------------------------------------------------ */
/* /api/data — 동 메타 + 지하철 그래프 + 평판 점수 번들                   */
/* ------------------------------------------------------------------ */

async function handleData(request: Request, env: Env): Promise<Response> {
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

async function handleGeocode(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return json({ results: [] });

  const cacheKey = `geo:${q.toLowerCase()}`;
  const cached = await env.ONEDAY_KV.get(cacheKey, "text");
  if (cached) {
    return json(JSON.parse(cached), 200, { "X-Oneday-Geocode": "kv-hit" });
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
    source = env.KAKAO_REST_KEY ? "kakao-empty→station" : "station";
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
  x: string;
  y: string;
}

async function kakaoSearch(q: string, key: string): Promise<GeoResult[]> {
  const headers = { Authorization: `KakaoAK ${key}` };

  // 장소(키워드) 검색을 먼저 한다 — "삼성전자 서초사옥", "서울대학교" 처럼
  // 회사·학교 이름으로 찾는 것이 이 서비스의 주 사용 방식이기 때문이다.
  const [placeRes, addrRes] = await Promise.all([
    fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?size=5&query=${encodeURIComponent(q)}`,
      { headers }
    ),
    fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?size=3&query=${encodeURIComponent(q)}`,
      { headers }
    ),
  ]);

  const out: GeoResult[] = [];

  if (placeRes.ok) {
    const data = (await placeRes.json()) as { documents?: KakaoDoc[] };
    for (const d of data.documents ?? []) {
      out.push({
        name: d.place_name ?? q,
        address: d.road_address_name || d.address_name || "",
        lat: Number(d.y),
        lng: Number(d.x),
        kind: "place",
      });
    }
  }

  if (addrRes.ok) {
    const data = (await addrRes.json()) as { documents?: KakaoDoc[] };
    for (const d of data.documents ?? []) {
      out.push({
        name: d.address_name ?? q,
        address: d.address_name ?? "",
        lat: Number(d.y),
        lng: Number(d.x),
        kind: "place",
      });
    }
  }

  return out.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/* --- 지하철역 폴백 --- */

interface StationLite {
  name: string;
  lat: number;
  lng: number;
  lines: string[];
}

/** isolate 수명 동안 재사용한다 (요청마다 번들을 다시 읽지 않기 위해) */
let stationCache: StationLite[] | null = null;

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
  if (stationCache) return stationCache;

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
