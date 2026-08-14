import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";

interface TestEnvOptions {
  kakaoKey?: string;
  cached?: Record<string, string>;
  getError?: Error;
  stations?: Array<{ name: string; lat: number; lng: number; lines: string[] }>;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

function makeTestEnv(options: TestEnvOptions = {}) {
  const get = vi.fn(async (key: string) => {
    if (options.getError) throw options.getError;
    return options.cached?.[key] ?? null;
  });
  const put = vi.fn(async () => undefined);
  const assetFetch = vi.fn(async () =>
    jsonResponse({ graph: { stations: options.stations ?? [] } })
  );

  const env = {
    ASSETS: { fetch: assetFetch },
    ONEDAY_KV: { get, put },
    KAKAO_REST_KEY: options.kakaoKey,
  } as unknown as Env;

  return { env, get, put, assetFetch };
}

function makeExecutionContext() {
  const pending: Promise<unknown>[] = [];
  const waitUntil = vi.fn((promise: Promise<unknown>) => pending.push(promise));
  const ctx = { waitUntil } as unknown as ExecutionContext;
  return { ctx, pending, waitUntil };
}

async function geocode(env: Env, ctx: ExecutionContext, query: string, method = "GET") {
  return worker.fetch(
    new Request(`https://example.com/api/geocode?q=${encodeURIComponent(query)}`, { method }),
    env,
    ctx
  );
}

async function data(env: Env, ctx: ExecutionContext, method = "GET") {
  return worker.fetch(new Request("https://example.com/api/data", { method }), env, ctx);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/api/data", () => {
  it("GET은 KV가 없을 때 정적 자산으로 폴백한다", async () => {
    const { env, assetFetch } = makeTestEnv();
    const { ctx } = makeExecutionContext();
    const response = await data(env, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Oneday-Source")).toBe("assets");
    expect(await response.json()).toEqual({ graph: { stations: [] } });
    expect(assetFetch).toHaveBeenCalledOnce();
  });

  it("GET 이외의 요청은 405로 거부한다", async () => {
    const { env, assetFetch } = makeTestEnv();
    const { ctx } = makeExecutionContext();
    const response = await data(env, ctx, "POST");

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(await response.json()).toEqual({ error: "GET만 지원합니다" });
    expect(assetFetch).not.toHaveBeenCalled();
  });
});

describe("/api/geocode 수도권 검색", () => {
  it("GET 이외의 요청은 405와 Allow 헤더를 반환한다", async () => {
    const { env } = makeTestEnv();
    const { ctx } = makeExecutionContext();
    const response = await geocode(env, ctx, "판교역", "POST");

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(await response.json()).toEqual({ error: "GET만 지원합니다" });
  });

  it("수도권 밖 결과를 제거하고 서울을 경기·인천보다 먼저 반환한다", async () => {
    const requestedUrls: URL[] = [];
    const kakaoFetch = vi.fn(async (input: unknown) => {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      const url = new URL(raw);
      requestedUrls.push(url);

      if (url.pathname.endsWith("/keyword.json")) {
        return jsonResponse({
          documents: [
            {
              place_name: "부산 지점",
              address_name: "부산 해운대구 우동 1",
              x: "129.1",
              y: "35.1",
            },
            {
              place_name: "경기 지점",
              road_address_name: "경기 성남시 분당구 판교역로 1",
              x: "127.1",
              y: "37.3",
            },
            {
              place_name: "서울 지점",
              address_name: "",
              road_address: { region_1depth_name: "서울" },
              x: "127.0",
              y: "37.5",
            },
            {
              place_name: "인천 지점",
              address_name: "인천 연수구 송도동 1",
              x: "126.6",
              y: "37.4",
            },
            {
              place_name: "지역 불명",
              address_name: "",
              x: "127.0",
              y: "37.5",
            },
          ],
        });
      }

      return jsonResponse({
        documents: [
          {
            address_name: "서울 종로구 세종로 1",
            address: { region_1depth_name: "서울" },
            x: "126.97",
            y: "37.57",
          },
          {
            address_name: "대구 중구 동성로 1",
            address: { region_1depth_name: "대구" },
            x: "128.6",
            y: "35.8",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", kakaoFetch);

    const { env, get, put } = makeTestEnv({ kakaoKey: "test-key" });
    const { ctx, pending } = makeExecutionContext();
    const response = await geocode(env, ctx, "맥도날드");
    const payload = (await response.json()) as { results: Array<{ name: string }> };

    expect(response.status).toBe(200);
    expect(payload.results.map((result) => result.name)).toEqual([
      "서울 지점",
      "서울 종로구 세종로 1",
      "경기 지점",
      "인천 지점",
    ]);
    expect(payload.results.some((result) => /부산|대구/.test(result.name))).toBe(false);

    const keywordUrl = requestedUrls.find((url) => url.pathname.endsWith("/keyword.json"));
    const addressUrl = requestedUrls.find((url) => url.pathname.endsWith("/address.json"));
    expect(keywordUrl?.searchParams.get("rect")).toBe("124.5,36.8,128.0,38.4");
    expect(keywordUrl?.searchParams.get("size")).toBe("15");
    expect(addressUrl?.searchParams.has("rect")).toBe(false);
    expect(get).toHaveBeenCalledWith("geo:v2:맥도날드", "text");

    await Promise.all(pending);
    expect(put).toHaveBeenCalledWith(
      "geo:v2:맥도날드",
      expect.any(String),
      { expirationTtl: 60 * 60 * 24 * 30 }
    );
  });

  it("서울 우선 정렬 후 결과를 최대 8건으로 제한한다", async () => {
    const documents = Array.from({ length: 10 }, (_, index) => ({
      place_name: `서울 지점 ${index + 1}`,
      address_name: `서울 강남구 역삼동 ${index + 1}`,
      x: String(127 + index / 1000),
      y: "37.5",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = new URL((input as string).toString());
        return url.pathname.endsWith("/keyword.json")
          ? jsonResponse({ documents })
          : jsonResponse({ documents: [] });
      })
    );

    const { env } = makeTestEnv({ kakaoKey: "test-key" });
    const { ctx } = makeExecutionContext();
    const response = await geocode(env, ctx, "서울 카페");
    const payload = (await response.json()) as { results: Array<{ name: string }> };

    expect(payload.results).toHaveLength(8);
    expect(payload.results.map((result) => result.name)).toEqual(
      documents.slice(0, 8).map((document) => document.place_name)
    );
  });

  it("v2 캐시가 있으면 카카오를 호출하지 않고 그대로 반환한다", async () => {
    const cachedPayload = {
      results: [
        {
          name: "서울시청",
          address: "서울 중구 세종대로 110",
          lat: 37.5666,
          lng: 126.978,
          kind: "place",
        },
      ],
    };
    const externalFetch = vi.fn();
    vi.stubGlobal("fetch", externalFetch);

    const { env, get, put } = makeTestEnv({
      kakaoKey: "test-key",
      cached: { "geo:v2:서울시청": JSON.stringify(cachedPayload) },
    });
    const { ctx } = makeExecutionContext();
    const response = await geocode(env, ctx, "서울시청");

    expect(await response.json()).toEqual(cachedPayload);
    expect(response.headers.get("X-Oneday-Geocode")).toBe("kv-hit");
    expect(get).toHaveBeenCalledWith("geo:v2:서울시청", "text");
    expect(externalFetch).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("카카오 한쪽 응답 JSON이 깨져도 다른 응답 결과를 유지한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = new URL((input as Request).url ?? String(input));
        if (url.pathname.endsWith("/keyword.json")) {
          return new Response("{broken-json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return jsonResponse({
          documents: [
            {
              address_name: "서울 중구 세종대로 1",
              x: "126.978",
              y: "37.566",
            },
          ],
        });
      })
    );

    const { env } = makeTestEnv({ kakaoKey: "test-key" });
    const { ctx } = makeExecutionContext();
    const response = await geocode(env, ctx, "서울 주소");
    const payload = (await response.json()) as { results: Array<{ name: string }> };

    expect(response.status).toBe(200);
    expect(payload.results.map((result) => result.name)).toEqual(["서울 중구 세종대로 1"]);
  });

  it("내부 오류 상세를 500 응답에 노출하지 않는다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { env } = makeTestEnv({ getError: new Error("secret KV detail") });
    const { ctx } = makeExecutionContext();
    const response = await geocode(env, ctx, "오류 테스트");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "서버 내부 오류가 발생했습니다" });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("카카오 키가 없으면 기존 수도권 전철 검색으로 폴백한다", async () => {
    const { env, assetFetch } = makeTestEnv({
      stations: [
        { name: "판교", lat: 37.3948, lng: 127.1112, lines: ["신분당"] },
        { name: "강남", lat: 37.4975, lng: 127.0276, lines: ["2", "신분당"] },
      ],
    });
    const { ctx } = makeExecutionContext();
    const response = await geocode(env, ctx, "판교역");
    const payload = (await response.json()) as {
      results: Array<{ name: string; kind: string }>;
    };

    expect(payload.results).toEqual([
      expect.objectContaining({ name: "판교역", kind: "station" }),
    ]);
    expect(response.headers.get("X-Oneday-Geocode")).toBe("station");
    expect(assetFetch).toHaveBeenCalledOnce();
  });

  it("깨졌거나 형태가 잘못된 캐시는 무시하고 역 검색으로 폴백한다", async () => {
    const stations = [{ name: "판교", lat: 37.3948, lng: 127.1112, lines: ["신분당"] }];
    const cachedValues = [
      "{broken-json",
      JSON.stringify({ results: [{ name: "불완전한 캐시" }] }),
    ];

    for (const cached of cachedValues) {
      const { env } = makeTestEnv({
        cached: { "geo:v2:판교역": cached },
        stations,
      });
      const { ctx } = makeExecutionContext();
      const response = await geocode(env, ctx, "판교역");
      const payload = (await response.json()) as { results: Array<{ name: string }> };

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Oneday-Geocode")).toBe("station");
      expect(payload.results.map((result) => result.name)).toEqual(["판교역"]);
    }
  });

  it("카카오 응답 JSON이 모두 깨져도 역 검색으로 폴백한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("{broken-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const { env } = makeTestEnv({ kakaoKey: "test-key" });
    const { ctx } = makeExecutionContext();
    const response = await geocode(env, ctx, "판교역");
    const payload = (await response.json()) as {
      results: Array<{ name: string; kind: string }>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Oneday-Geocode")).toBe("kakao-empty-station");
    expect(payload.results).toEqual([
      expect.objectContaining({ name: "판교역", kind: "station" }),
    ]);
  });
});
