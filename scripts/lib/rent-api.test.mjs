import { describe, expect, it, vi } from "vitest";
import { contractMonths, fetchPaginatedRentJob } from "./rent-api.mjs";

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
    expect(result.records[0].converted).toBeCloseTo(54.5833, 4);
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
});
