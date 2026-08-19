import {
  DISTRICT_ALIASES,
  DONG_ALIASES,
  FULL_DONG_ALIASES,
  LINE_ALIASES,
  STATION_ALIASES,
  type GeographicAlias,
} from "../data/geographicAliases";
import type { Destination, DongMeta, Station, SubwayGraph } from "../types";
import { translate, type Locale } from "./locale";

function pick(alias: GeographicAlias | undefined, canonical: string, locale: Locale): string {
  if (locale === "ko") return canonical;
  return alias?.[locale] ?? canonical;
}

export function localizedDongName(dong: DongMeta, locale: Locale): string {
  return pick(FULL_DONG_ALIASES[dong.code], dong.name, locale);
}

export function localizedDongShortName(dong: DongMeta, locale: Locale): string {
  return pick(DONG_ALIASES[dong.code], dong.dong, locale);
}

export function localizedDistrictName(name: string, locale: Locale): string {
  return pick(DISTRICT_ALIASES[name], name, locale);
}

export function localizedStationName(name: string, locale: Locale): string {
  return pick(STATION_ALIASES[name], name, locale);
}

export function localizedStationLabel(name: string, locale: Locale): string {
  const localized = localizedStationName(name, locale);
  if (locale === "en") return `${localized} Station`;
  if (locale === "ja") return `${localized}駅`;
  return `${localized}역`;
}

export function localizedLineName(line: string, locale: Locale): string {
  if (locale === "ko") return pick(LINE_ALIASES[line], line, locale);
  return pick(LINE_ALIASES[line], line, locale);
}

export interface GeographicSuggestion extends Destination {
  kind: "station" | "neighborhood";
  searchText: string;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/station|neighborhood|subway|metro|駅|行政洞|洞|区|市|역|동|구|시/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function aliasesFor(alias: GeographicAlias | undefined, canonical: string): string[] {
  return [canonical, alias?.en ?? "", alias?.ja ?? ""].filter(Boolean);
}

export function buildGeographicSuggestions(
  dongs: DongMeta[],
  graph: SubwayGraph,
  locale: Locale
): GeographicSuggestion[] {
  const neighborhoods = dongs.map((dong): GeographicSuggestion => {
    const name = localizedDongName(dong, locale);
    const searchText = [
      ...aliasesFor(FULL_DONG_ALIASES[dong.code], dong.name),
      ...aliasesFor(DONG_ALIASES[dong.code], dong.dong),
      ...aliasesFor(DISTRICT_ALIASES[dong.gu], dong.gu),
    ]
      .map(normalizeSearch)
      .join(" ");
    return {
      name,
      address: localizedDistrictName(dong.gu, locale),
      lat: dong.markerLat ?? dong.lat,
      lng: dong.markerLng ?? dong.lng,
      kind: "neighborhood",
      searchText,
    };
  });

  const stations = graph.stations.map((station): GeographicSuggestion => {
    const name = localizedStationLabel(station.name, locale);
    const searchText = aliasesFor(STATION_ALIASES[station.name], station.name)
      .flatMap((alias) => [alias, `${alias} station`, `${alias}駅`, `${alias}역`])
      .map(normalizeSearch)
      .join(" ");
    return {
      name,
      address: translate(locale, "지하철역"),
      lat: station.lat,
      lng: station.lng,
      kind: "station",
      searchText,
    };
  });

  return [...stations, ...neighborhoods];
}

function matchScore(item: GeographicSuggestion, normalizedQuery: string): number {
  if (!normalizedQuery || !item.searchText.includes(normalizedQuery)) return -1;
  const normalizedName = normalizeSearch(item.name);
  if (normalizedName === normalizedQuery) return 100;
  if (normalizedName.startsWith(normalizedQuery)) return 80;
  if (item.kind === "station") return 60;
  return 40;
}

export function searchGeographicSuggestions(
  entries: GeographicSuggestion[],
  query: string,
  limit = 8
): GeographicSuggestion[] {
  const normalizedQuery = normalizeSearch(query);
  if (normalizedQuery.length < 2) return [];
  return entries
    .map((item) => ({ item, score: matchScore(item, normalizedQuery) }))
    .filter((result) => result.score >= 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((result) => result.item);
}

export function stationByName(graph: SubwayGraph, name: string): Station | undefined {
  return graph.stations.find((station) => station.name === name);
}
