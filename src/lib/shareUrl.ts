import type { Destination, RentHousingType, Weights } from "../types";
import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_OFF,
  DEFAULT_MAX_COMMUTE_MIN,
  DEFAULT_WEIGHTS,
  MAX_DESTINATIONS,
} from "./constants";
import { DEFAULT_RENT_SELECTION, rentComboKey, sortRentTypes } from "./rent-selection";

/**
 * 화면 상태를 URL 로 주고받는다.
 *
 * "내가 찾은 동네"를 링크로 보낼 수 있게 하는 게 목적이다. 서버에 아무것도
 * 저장하지 않으므로 KV 도 Worker 요청도 늘지 않는다.
 *
 * 목적지는 **이름과 좌표를 함께** 싣는다. 좌표가 있으면 링크를 연 사람이
 * 지오코딩을 다시 호출하지 않아도 되고, Kakao 키가 없는 환경에서도 복원된다.
 */

export interface ShareState {
  destinations: Destination[];
  maxCommute: number;
  weights: Weights;
  budget: number;
  mapMode: "grade" | "commute";
  showSubway: boolean;
  hiddenLines: string[];
  /** 가격 축을 다시 계산할 때 포함할 주택유형. 기본값과 같으면 URL에 안 싣는다. */
  rentTypes: RentHousingType[];
  /** converted=보증금 환산 포함(기본), raw=순수 월세 */
  rentMode: "converted" | "raw";
}

export const DEFAULT_SHARE_STATE: ShareState = {
  destinations: [],
  maxCommute: DEFAULT_MAX_COMMUTE_MIN,
  weights: { ...DEFAULT_WEIGHTS },
  budget: BUDGET_OFF,
  mapMode: "grade",
  showSubway: true,
  hiddenLines: [],
  rentTypes: [...DEFAULT_RENT_SELECTION.types],
  rentMode: DEFAULT_RENT_SELECTION.mode,
};

const VALID_RENT_TYPES = new Set<RentHousingType>([
  "house",
  "rowhouse",
  "officetel",
  "apartment",
]);

/** 좌표는 소수 5자리면 약 1m — 그 이상은 URL 만 길어진다 */
const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

export function encodeShareState(s: ShareState): string {
  const p = new URLSearchParams();

  for (const d of s.destinations) {
    // 이름에 쉼표·@ 가 들어갈 수 있으므로 좌표를 뒤에 붙이고 마지막 @ 로 자른다
    p.append("to", `${d.name}@${round5(d.lat)},${round5(d.lng)}`);
  }
  if (s.maxCommute !== DEFAULT_SHARE_STATE.maxCommute) p.set("max", String(s.maxCommute));

  const w = s.weights;
  const dw = DEFAULT_SHARE_STATE.weights;
  if (w.safety !== dw.safety || w.price !== dw.price || w.convenience !== dw.convenience) {
    p.set(
      "w",
      [w.safety, w.price, w.convenience].map((x) => Math.round(x * 100)).join(",")
    );
  }
  if (s.budget < BUDGET_OFF) p.set("budget", String(s.budget));
  if (s.mapMode !== DEFAULT_SHARE_STATE.mapMode) p.set("mode", s.mapMode);
  if (!s.showSubway) p.set("sub", "0");
  if (s.hiddenLines.length) p.set("off", s.hiddenLines.join(","));

  if (rentComboKey(s.rentTypes) !== rentComboKey(DEFAULT_SHARE_STATE.rentTypes)) {
    p.set("rentTypes", sortRentTypes(s.rentTypes).join(","));
  }
  if (s.rentMode !== DEFAULT_SHARE_STATE.rentMode) p.set("rentMode", s.rentMode);

  return p.toString();
}

export function decodeShareState(search: string): ShareState {
  const p = new URLSearchParams(search);
  const s: ShareState = {
    ...DEFAULT_SHARE_STATE,
    weights: { ...DEFAULT_SHARE_STATE.weights },
    destinations: [],
    hiddenLines: [],
  };

  for (const raw of p.getAll("to")) {
    // UI가 강제하는 상한과 맞춘다 — 안 그러면 "to" 를 4개 이상 넣은 링크로
    // 그 상한을 그냥 우회할 수 있다.
    if (s.destinations.length >= MAX_DESTINATIONS) break;
    const at = raw.lastIndexOf("@");
    if (at < 1) continue;
    const name = raw.slice(0, at);
    const [latStr, lngStr] = raw.slice(at + 1).split(",");
    const lat = Number(latStr);
    const lng = Number(lngStr);
    // 서울 근방 좌표만 받는다 — 이상한 링크로 지도가 엉뚱한 데로 날아가지 않게
    if (!inSeoulArea(lat, lng)) continue;
    s.destinations.push({ name, address: "", lat, lng });
  }

  const max = Number(p.get("max"));
  if (Number.isFinite(max) && max >= 15 && max <= 90) s.maxCommute = max;

  const w = p.get("w")?.split(",").map(Number);
  if (w?.length === 3 && w.every((x) => Number.isFinite(x) && x >= 0)) {
    const sum = w[0] + w[1] + w[2];
    if (sum > 0) {
      s.weights = { safety: w[0] / sum, price: w[1] / sum, convenience: w[2] / sum };
    }
  }

  const budget = Number(p.get("budget"));
  if (Number.isFinite(budget) && budget >= BUDGET_MIN && budget <= BUDGET_MAX) {
    s.budget = budget;
  }

  const mode = p.get("mode");
  if (mode === "commute" || mode === "grade") s.mapMode = mode;

  if (p.get("sub") === "0") s.showSubway = false;

  const off = p.get("off");
  if (off) s.hiddenLines = off.split(",").filter(Boolean);

  const rentTypesRaw = p.get("rentTypes");
  if (rentTypesRaw) {
    // 존재하지 않는 유형이 섞인 링크는 그 부분만 버린다 — 링크를 안 믿는다는
    // 원칙대로, 전부 잘못됐으면(빈 배열) 기본값으로 되돌린다.
    const valid = rentTypesRaw
      .split(",")
      .filter((t): t is RentHousingType => VALID_RENT_TYPES.has(t as RentHousingType));
    const sorted = sortRentTypes(valid);
    if (sorted.length > 0) s.rentTypes = sorted;
  }

  const rentMode = p.get("rentMode");
  if (rentMode === "raw" || rentMode === "converted") s.rentMode = rentMode;

  return s;
}

/** 수도권 전철 범위 — 목적지 좌표 검증용 */
function inSeoulArea(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat > 36.5 &&
    lat < 38.5 &&
    lng > 126 &&
    lng < 128
  );
}
