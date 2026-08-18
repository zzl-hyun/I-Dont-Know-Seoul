import { describe, expect, it, vi } from "vitest";
import { contractMonths, fetchPaginatedRentJob } from "./rent-api.mjs";
import { rentConversionRate } from "./rent.mjs";

const endpoint = { name: "house", url: "https://example.test/rent" };

function response(items, totalCount = items.length, resultCode = "000") {
  return {
    text: async () =>
      JSON.stringify({
        response: {
          header: { resultCode },
          body: { totalCount, items: { item: items } },
        },
      }),
  };
}

function item(overrides = {}) {
  return {
    contractType: "신규",
    totalFloorAr: "25",
    deposit: "1,000",
    monthlyRent: "50",
    umdNm: "문정동",
    ...overrides,
  };
}

describe("contractMonths", () => {
  it("2023~2025 완전한 36개월을 만든다", () => {
    const months = contractMonths("20230101", "20251231");
    expect(months).toHaveLength(36);
    expect(months[0]).toBe("202301");
    expect(months.at(-1)).toBe("202512");
  });
});

describe("fetchPaginatedRentJob", () => {
  it("totalCount에 맞춰 끝 페이지까지 읽고 신규 소형 월세만 남긴다", async () => {
    const first = Array.from({ length: 1_000 }, (_, i) =>
      item(i === 0 ? {} : { contractType: "갱신" })
    );
    const second = [item({ umdNm: "정자동", monthlyRent: "60" })];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(first, 1_001))
      .mockResolvedValueOnce(response(second, 1_001));

    const result = await fetchPaginatedRentJob({
      key: "secret",
      gu: "41135",
      ym: "202501",
      endpoint,
      fetchImpl,
      sleep: async () => {},
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toContain("pageNo=1");
    expect(fetchImpl.mock.calls[1][0]).toContain("pageNo=2");
    expect(result.calls).toBe(2);
    expect(result.records).toHaveLength(2);
    // 보증금 1,000만 · 월세 50만 · 경기(41135) 단독주택 전환율 7.71%
    // → 50 + 1,000 × 0.0771 ÷ 12 = 56.425
    expect(result.records[0].converted).toBeCloseTo(
      50 + (1_000 * rentConversionRate("house", "41135")) / 12,
      4
    );
    expect(result.records[1].legal).toBe("정자동");
  });

  it("뒤 페이지가 계속 실패하면 앞 페이지 일부를 반환하지 않고 거부한다", async () => {
    const first = Array.from({ length: 1_000 }, () => item());
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(first, 1_001))
      .mockResolvedValue(response([], 0, "ERROR"));

    await expect(
      fetchPaginatedRentJob({
        key: "secret",
        gu: "41135",
        ym: "202501",
        endpoint,
        fetchImpl,
        sleep: async () => {},
        maxRetry: 1,
      })
    ).rejects.toThrow(/2페이지/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("표본이 totalCount보다 적으면 조용히 부분 집계하지 않는다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([item()], 2));
    await expect(
      fetchPaginatedRentJob({
        key: "secret",
        gu: "41135",
        ym: "202501",
        endpoint,
        fetchImpl,
        sleep: async () => {},
      })
    ).rejects.toThrow(/일부만/);
  });

  // 단지명 필드가 엔드포인트마다 다르다. 하나라도 이름을 잘못 짚으면 그 유형만
  // 공공임대가 조용히 섞여 들어가고, 결측이 아니라 "싼 월세"로 보여서 어느
  // 검증에도 안 걸린다.
  it.each([
    ["apartment", "aptNm", 60],
    ["officetel", "offiNm", 30],
    ["rowhouse", "mhouseNm", 30],
  ])("%s 은 %s 로 공공임대를 걸러낸다", async (name, field, area) => {
    const typed = { name, url: "https://example.test/rent" };
    const items = [
      item({ excluUseAr: String(area), [field]: "백현마을3단지(주공)임대" }),
      item({ excluUseAr: String(area), [field]: "봇들마을3단지(주공)", monthlyRent: "140" }),
    ];
    const result = await fetchPaginatedRentJob({
      key: "secret",
      gu: "41135",
      ym: "202501",
      endpoint: typed,
      fetchImpl: vi.fn().mockResolvedValue(response(items)),
      sleep: async () => {},
    });

    expect(result.publicRental).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].monthly).toBe(140);
  });

  it("단독·다가구는 단지명 필드가 없어 아무것도 걸러내지 않는다", async () => {
    const result = await fetchPaginatedRentJob({
      key: "secret",
      gu: "41135",
      ym: "202501",
      endpoint,
      fetchImpl: vi.fn().mockResolvedValue(response([item(), item()])),
      sleep: async () => {},
    });

    expect(result.publicRental).toBe(0);
    expect(result.records).toHaveLength(2);
  });
});
