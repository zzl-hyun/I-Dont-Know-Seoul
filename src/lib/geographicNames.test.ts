import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AppData } from "./data";
import {
  DISTRICT_ALIASES,
  DONG_ALIASES,
  FULL_DONG_ALIASES,
  LINE_ALIASES,
  STATION_ALIASES,
} from "../data/geographicAliases";
import {
  buildGeographicSuggestions,
  localizedDongName,
  localizedStationName,
  searchGeographicSuggestions,
} from "./geographicNames";

interface RawBundle extends Omit<AppData, "scores"> {
  scores: Record<string, unknown>;
}

const raw = JSON.parse(readFileSync("public/data/bundle.json", "utf8")) as RawBundle;

describe("geographic aliases", () => {
  it("covers every canonical neighborhood, district, station name, and line", () => {
    const districtNames = new Set(raw.dongs.map((dong) => dong.gu));
    const stationNames = new Set(raw.graph.stations.map((station) => station.name));
    const lineNames = new Set(raw.graph.nodes.map((node) => node.line));

    expect(Object.keys(DONG_ALIASES)).toHaveLength(raw.dongs.length);
    expect(Object.keys(FULL_DONG_ALIASES)).toHaveLength(raw.dongs.length);
    expect(Object.keys(DISTRICT_ALIASES)).toHaveLength(districtNames.size);
    expect(Object.keys(STATION_ALIASES)).toHaveLength(stationNames.size);
    expect(Object.keys(LINE_ALIASES)).toHaveLength(lineNames.size);

    for (const catalogue of [
      DONG_ALIASES,
      FULL_DONG_ALIASES,
      DISTRICT_ALIASES,
      STATION_ALIASES,
      LINE_ALIASES,
    ]) {
      for (const alias of Object.values(catalogue)) {
        expect(alias.en).not.toMatch(/[가-힣]/);
        expect(alias.ja).not.toMatch(/[가-힣]/);
        expect(alias.en.length).toBeGreaterThan(0);
        expect(alias.ja.length).toBeGreaterThan(0);
      }
    }
  });

  it("finds EN and JA aliases at the canonical station coordinates", () => {
    const canonical = raw.graph.stations.find((station) => station.name === "강남");
    expect(canonical).toBeDefined();

    for (const locale of ["en", "ja"] as const) {
      const suggestions = buildGeographicSuggestions(raw.dongs, raw.graph, locale);
      const query = locale === "en" ? "Gangnam Station" : "カンナム駅";
      const found = searchGeographicSuggestions(suggestions, query).find(
        (result) => result.kind === "station"
      );
      expect(found).toMatchObject({ lat: canonical!.lat, lng: canonical!.lng });
      expect(found?.name).toContain(localizedStationName("강남", locale));
    }
  });

  it("uses an alias for every localized neighborhood label", () => {
    for (const dong of raw.dongs) {
      expect(localizedDongName(dong, "en")).toBe(FULL_DONG_ALIASES[dong.code].en);
      expect(localizedDongName(dong, "ja")).toBe(FULL_DONG_ALIASES[dong.code].ja);
    }
  });
});
