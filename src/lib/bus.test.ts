import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BusNetwork } from "../types";
import { findBestBusAccess, rebuildBusAccess } from "./bus";
import { BUS_TRIGGER_WALK_MIN } from "./constants";
import { haversineM, walkMinutes } from "./geo";

function network(cumulative = [0, 1100, 2200], headway = 8): BusNetwork {
  return {
    version: "test",
    generatedAt: "2026-08-12T00:00:00.000Z",
    defaultHeadwayMin: 8,
    sources: {},
    stops: [
      ["출발 정류장", 37.5, 127],
      ["중간 정류장", 37.5, 127.01],
      ["도착 정류장", 37.5, 127.02],
    ],
    routes: [["테스트버스", headway, [0, 1, 2], cumulative]],
  };
}

describe("정적 첫·마지막 버스 접근", () => {
  const west = { lat: 37.5, lng: 127 };
  const east = { lat: 37.5, lng: 127.02 };

  it("도보 15분 초과 구간만 같은 노선의 정방향 버스로 대체한다", () => {
    expect(walkMinutes(haversineM(west.lat, west.lng, east.lat, east.lng))).toBeGreaterThan(
      BUS_TRIGGER_WALK_MIN
    );
    const access = findBestBusAccess(network(), west, east);
    expect(access).not.toBeNull();
    expect(access!.routeName).toBe("테스트버스");
    expect(access!.stops).toBe(2);
    expect(access!.rideDistanceM).toBe(2200);
    expect(access!.ridePath).toHaveLength(3);
  });

  it("같은 정류장 배열이어도 역방향은 임의 연결하지 않는다", () => {
    expect(findBestBusAccess(network(), east, west)).toBeNull();
  });

  it("15분 이내 도보는 버스가 있어도 그대로 걷는다", () => {
    const close = { lat: 37.5, lng: 127.005 };
    expect(walkMinutes(haversineM(west.lat, west.lng, close.lat, close.lng))).toBeLessThan(
      BUS_TRIGGER_WALK_MIN
    );
    expect(findBestBusAccess(network(), west, close)).toBeNull();
  });

  it("운행거리나 배차 때문에 도보보다 느리면 채택하지 않는다", () => {
    expect(findBestBusAccess(network([0, 5000, 10000], 60), west, east)).toBeNull();
  });

  it("배차간격과 정류장 수를 포함해 시간이 구성된다", () => {
    const access = findBestBusAccess(network(), west, east)!;
    expect(access.waitMin).toBe(4);
    expect(access.rideMin).toBeCloseTo(9.2, 5);
    expect(access.totalMin).toBeCloseTo(
      access.walkToBoardMin + access.waitMin + access.rideMin + access.walkFromAlightMin,
      10
    );
  });

  it("저장한 노선·순번으로 좌표 없이도 같은 구간을 복원한다", () => {
    const generalizedWest = { lat: 37.501, lng: 126.999 };
    const access = rebuildBusAccess(network(), generalizedWest, east, [0, 0, 2, 1.25]);

    expect(access).not.toBeNull();
    expect(access!.routeName).toBe("테스트버스");
    expect(access!.boardStop).toBe("출발 정류장");
    expect(access!.alightStop).toBe("도착 정류장");
    expect(access!.walkToBoardMin).toBe(1.25);
    expect(access!.ridePath).toHaveLength(3);
  });
});

describe("판교역 → SK AX 회귀", () => {
  const realNetwork: BusNetwork = JSON.parse(
    readFileSync(join(__dirname, "../../data/dist/bus-network.json"), "utf8")
  );
  const pangyo = { lat: 37.394776, lng: 127.11116 };
  const skAx = { lat: 37.40587, lng: 127.09981 };

  it("34분 도보 대신 실제 정방향 노선을 찾아 합리적인 정적 버스시간으로 바꾼다", () => {
    const directWalk = walkMinutes(haversineM(pangyo.lat, pangyo.lng, skAx.lat, skAx.lng));
    const access = findBestBusAccess(realNetwork, pangyo, skAx);

    expect(directWalk).toBeGreaterThan(30);
    expect(access, "판교역과 SK AX를 잇는 같은 방향 버스가 없음").not.toBeNull();
    expect(access!.totalMin).toBeLessThan(directWalk);
    expect(access!.totalMin).toBeGreaterThanOrEqual(8);
    expect(access!.totalMin).toBeLessThanOrEqual(25);
    expect(access!.rideDistanceM).toBeGreaterThan(500);
  });
});
