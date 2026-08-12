import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRoute, computeCommute } from "../../src/lib/commute";
import type {
  BusNetwork,
  DongMeta,
  ResidentialAccess,
  SubwayGraph,
} from "../../src/types";
import { buildResidentialAccess } from "./bus-access.mjs";

const ROOT = join(import.meta.dirname, "../..");
const POPULATION_PATH = join(ROOT, "data/raw/grid-population-100m-2024.json");

const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8"));

describe.skipIf(!existsSync(POPULATION_PATH))(
  "SGIS 원자료가 있을 때 거주 프로필 집약 품질",
  () => {
    // 43,780개 셀을 집약 전후로 각각 28개 목적지에 대해 다시 계산하는 무거운
    // 검증이라 실제 실행시간이 기본 5000ms 타임아웃과 거의 같다(4,996~5,361ms
    // 실측). 시스템 부하가 조금만 늘어도 로직과 무관하게 timeout으로 실패한다.
    it("좌표를 제거해도 통근 오차·필터 경계·경로 복원이 품질 게이트 안이다", () => {
      const graph = read<SubwayGraph>(join(ROOT, "data/dist/subway-graph.json"));
      const dongs = read<{ dongs: DongMeta[] }>(
        join(ROOT, "data/dist/dong-meta.json"),
      ).dongs;
      const bus = read<BusNetwork>(join(ROOT, "data/dist/bus-network.json"));
      const population = read<unknown>(POPULATION_PATH);
      const compressed = read<ResidentialAccess>(
        join(ROOT, "data/dist/residential-access.json"),
      );
      const exact = buildResidentialAccess(population, graph, bus, {
        aggregateProfiles: false,
        generatedAt: "2026-08-12T00:00:00.000Z",
      }).residential;

      const named = [
        "강남",
        "여의도",
        "서울역",
        "잠실",
        "판교",
        "광교중앙",
        "수원",
        "정자",
      ]
        .map((name) => graph.stations.find((station) => station.name === name))
        .filter((station): station is SubwayGraph["stations"][number] => Boolean(station));
      const sampled = graph.stations.filter((_, index) => index % 31 === 0).slice(0, 20);
      const destinations = [
        ...named,
        ...sampled,
        { name: "SK AX", lat: 37.40587, lng: 127.09981 },
      ];

      const errors: number[] = [];
      const membershipChanges = new Map([[40, 0], [55, 0], [70, 0]]);
      let fallbacks = 0;
      let routeSumMismatches = 0;

      for (const destination of destinations) {
        const before = computeCommute(graph, dongs, destination, bus, exact);
        const after = computeCommute(graph, dongs, destination, bus, compressed);
        for (const dong of dongs) {
          const left = before.byDong.get(dong.code)!;
          const right = after.byDong.get(dong.code)!;
          if (left.totalMin == null || right.totalMin == null) continue;
          errors.push(Math.abs(left.totalMin - right.totalMin));
          for (const limit of membershipChanges.keys()) {
            if ((left.totalMin <= limit) !== (right.totalMin <= limit)) {
              membershipChanges.set(limit, membershipChanges.get(limit)! + 1);
            }
          }

          const legs = buildRoute(graph, after, right, dong);
          if (
            legs.some(
              (leg) => leg.kind === "bus" && leg.routeName === "버스 접근(추정)",
            )
          ) {
            fallbacks += 1;
          }
          const routeSum = legs.reduce((sum, leg) => sum + leg.minutes, 0);
          if (Math.abs(routeSum - right.totalMin) > 1e-7) routeSumMismatches += 1;
        }
      }

      errors.sort((a, b) => a - b);
      const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length;
      const p95 = errors[Math.floor(errors.length * 0.95)];
      const max = errors.at(-1)!;
      const profileCount = Object.values(compressed.byDong).reduce(
        (sum, profiles) => sum + profiles.length,
        0,
      );

      console.log(
        `[access-quality] ${destinations.length}개 목적지 · ${errors.length}건 · ` +
          `평균 ${mean.toFixed(3)}분 · p95 ${p95.toFixed(2)}분 · ` +
          `최대 ${max.toFixed(2)}분`,
      );
      expect(destinations).toHaveLength(28);
      expect(errors).toHaveLength(15_316);
      expect(mean).toBeLessThanOrEqual(0.5);
      expect(p95).toBeLessThanOrEqual(1.5);
      expect(max).toBeLessThanOrEqual(3);
      for (const changed of membershipChanges.values()) {
        expect(changed / errors.length).toBeLessThanOrEqual(0.01);
      }
      expect(profileCount).toBe(13_068);
      expect(
        Object.values(compressed.byDong).every((profiles) =>
          profiles.every((profile) => profile.length === 2),
        ),
      ).toBe(true);
      expect(fallbacks).toBe(0);
      expect(routeSumMismatches).toBe(0);
    }, 20_000);
  },
);
