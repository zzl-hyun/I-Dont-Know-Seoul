import { describe, it, expect } from "vitest";
import { assertValidBundle } from "./data";

/** 427개 동 최소 요건(400개)을 넘기는 최소한의 유효 번들 */
function validBundle() {
  const dongs = Array.from({ length: 400 }, (_, i) => ({ code: String(i) }));
  const scores = Object.fromEntries(dongs.map((d) => [d.code, {}]));
  return {
    dongs,
    graph: { stations: [{ name: "강남" }] },
    scores,
    meta: { scoreVersion: "2026-08-10" },
  } as any;
}

describe("assertValidBundle — /api/data 응답의 최상위 구조를 검증한다", () => {
  it("정상 번들은 통과한다", () => {
    expect(() => assertValidBundle(validBundle())).not.toThrow();
  });

  it("행정동이 400개 미만이면 던진다", () => {
    const b = validBundle();
    b.dongs = b.dongs.slice(0, 10);
    expect(() => assertValidBundle(b)).toThrow(/행정동/);
  });

  it("지하철 그래프가 비어 있으면 던진다", () => {
    const b = validBundle();
    b.graph = { stations: [] };
    expect(() => assertValidBundle(b)).toThrow(/지하철/);
  });

  it("점수 개수가 동 개수와 다르면 던진다", () => {
    const b = validBundle();
    delete b.scores[b.dongs[0].code];
    expect(() => assertValidBundle(b)).toThrow(/점수 개수/);
  });

  it("버전 정보가 없으면 던진다", () => {
    const b = validBundle();
    b.meta = {};
    expect(() => assertValidBundle(b)).toThrow(/버전/);
  });
});
