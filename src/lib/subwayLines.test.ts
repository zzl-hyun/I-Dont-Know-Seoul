import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SubwayGraph } from "../types";
import { buildSubwayLayers, LINE_COLOR, lineName, UNKNOWN_LINE_COLOR } from "./subwayLines";

const graph: SubwayGraph = JSON.parse(
  readFileSync(join(__dirname, "../../data/dist/subway-graph.json"), "utf8")
);
const layers = buildSubwayLayers(graph);

describe("노선 색", () => {
  it("그래프의 모든 노선이 색을 갖는다", () => {
    // 새 노선이 생겼는데 색 테이블에 없으면 화면에서 조용히 회색으로 그려진다.
    // 아무도 눈치채지 못하므로 여기서 막는다.
    expect(layers.missingColors, `LINE_COLOR 에 없는 노선: ${layers.missingColors.join(", ")}`)
      .toEqual([]);
  });

  it("서울 주요 노선이 알려진 색이다", () => {
    expect(LINE_COLOR["2"]).toBe("#00A84D"); // 초록
    expect(LINE_COLOR["신분당"]).toBe("#D4003B"); // 빨강
    expect(LINE_COLOR["4"]).toBe("#00A5DE"); // 하늘
  });

  it("폴백 색은 실제로 쓰이지 않는다", () => {
    const used = layers.lines.features.map((f) => f.properties.color);
    expect(used).not.toContain(UNKNOWN_LINE_COLOR);
  });
});

describe("노선 구간", () => {
  it("노선 수만큼 피처가 나온다", () => {
    const linesInGraph = new Set(graph.nodes.map((n) => n.line));
    expect(layers.lines.features).toHaveLength(linesInGraph.size);
  });

  it("양방향 엣지를 중복해 그리지 않는다", () => {
    const segments = layers.lines.features.reduce(
      (s, f) => s + f.geometry.coordinates.length,
      0
    );
    const rideEdges = graph.edges.reduce(
      (s, out) => s + (out ?? []).filter((e) => e.kind === "ride").length,
      0
    );
    // 승차 엣지는 정확히 양방향으로 들어 있으므로 절반이 되어야 한다
    expect(segments).toBe(rideEdges / 2);
  });

  it("모든 구간이 두 점으로 이뤄진다", () => {
    for (const f of layers.lines.features) {
      for (const seg of f.geometry.coordinates) {
        expect(seg).toHaveLength(2);
      }
    }
  });

  it("2호선이 순환선이라 역 수만큼 구간이 있다", () => {
    const l2 = layers.lines.features.find((f) => f.properties.line === "2")!;
    // 본선 순환(43) + 성수지선 + 신정지선
    expect(l2.geometry.coordinates.length).toBeGreaterThan(43);
  });
});

describe("역", () => {
  it("그래프의 모든 역이 점으로 나온다", () => {
    expect(layers.stations.features).toHaveLength(graph.stations.length);
  });

  it("환승역이 흰 점으로 구분된다", () => {
    const transfers = layers.stations.features.filter((f) => f.properties.isTransfer);
    const expected = graph.stations.filter((s) => s.lines.length > 1).length;
    expect(transfers).toHaveLength(expected);
    expect(transfers.length).toBeGreaterThan(50);
    for (const t of transfers) expect(t.properties.color).toBe("#ffffff");
  });

  it("강남역은 2호선·신분당선 환승역이다", () => {
    const gangnam = layers.stations.features
      .filter((f) => f.properties.name === "강남")
      .sort(
        (a, b) =>
          Math.abs(a.geometry.coordinates[1] - 37.4975) -
          Math.abs(b.geometry.coordinates[1] - 37.4975)
      )[0];
    expect(gangnam.properties.isTransfer).toBe(true);
    expect(gangnam.properties.lineCount).toBe(2);
  });

  it("좌표가 [경도, 위도] 순서다", () => {
    /*
     * 뒤바뀌면 지도에 아무것도 안 보이는데 오류는 나지 않는다.
     *
     * 범위는 수도권 전철 실제 범위다 — 그래프에는 서울 밖 역도 147개 있다.
     * 1호선이 신창(위도 36.77)까지, 연천(38.10)까지 이어지기 때문이다.
     * 지도는 서울로 maxBounds 가 걸려 있어 화면엔 안 나오지만, 노선이 서울
     * 경계에서 잘리지 않고 자연스럽게 이어지려면 이 역들이 필요하다.
     */
    for (const f of layers.stations.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(lng, `${f.properties.name} 경도`).toBeGreaterThan(126);
      expect(lng, `${f.properties.name} 경도`).toBeLessThan(128);
      expect(lat, `${f.properties.name} 위도`).toBeGreaterThan(36.5);
      expect(lat, `${f.properties.name} 위도`).toBeLessThan(38.5);
    }
  });
});

describe("노선 이름", () => {
  it("식별자를 사람이 읽는 이름으로 바꾼다", () => {
    expect(lineName("2")).toBe("2호선");
    expect(lineName("W")).toBe("우이신설선");
    expect(lineName("Silim")).toBe("신림선");
    expect(lineName("신분당")).toBe("신분당선");
    expect(lineName("경의·중앙")).toBe("경의·중앙선");
  });
});
