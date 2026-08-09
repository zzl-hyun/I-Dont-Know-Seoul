import type { Destination, Weights } from "../types";
import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_OFF,
  DEFAULT_MAX_COMMUTE_MIN,
  DEFAULT_WEIGHTS,
} from "./constants";

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
}

export const DEFAULT_SHARE_STATE: ShareState = {
  destinations: [],
  maxCommute: DEFAULT_MAX_COMMUTE_MIN,
  weights: { ...DEFAULT_WEIGHTS },
  budget: BUDGET_OFF,
  mapMode: "grade",
  showSubway: true,
  hiddenLines: [],
};

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
