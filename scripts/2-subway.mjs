/**
 * 2-subway.mjs — 지하철 그래프 구축
 *
 * 입력: OpenStreetMap Overpass API (키 불필요, 최신 데이터, 오픈 라이선스)
 * 출력: data/dist/subway-graph.json
 *
 * 왜 OSM인가:
 *   국내 공개 데이터셋(서울교통공사 역간거리 등)은 1~8호선만 다루거나
 *   수년째 갱신이 멈춰 있어서, 신림선(2022)·우이신설선(2017)·신분당선 연장이
 *   빠진다. 관악구·강북구가 통째로 "역 없음"이 되어 자취 추천이 망가진다.
 *   OSM은 노선 릴레이션에 정차 순서가 들어있고 신설 노선이 즉시 반영된다.
 *
 * 그래프 모델:
 *   노드 = (역, 노선) 쌍. 강남역은 2호선 노드와 신분당선 노드로 나뉘고
 *   그 사이를 환승 엣지가 잇는다. 이렇게 해야 환승 비용이 경로 탐색에
 *   자연스럽게 반영된다.
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { haversineM } from "./lib/geo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "data/raw/osm-subway.json");
const OUT = join(ROOT, "data/dist/subway-graph.json");

/**
 * Overpass 공개 인스턴스는 자주 과부하(504)가 난다. 미러를 돌아가며 재시도한다.
 * 한 번 성공하면 data/raw/osm-subway.json 에 캐시되므로 재실행 시엔 호출하지 않는다.
 */
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];
const MAX_ATTEMPTS = 3;

/** 서울 + 인접 경기/인천 일부. 서울 밖 역도 경로 중간에 필요할 수 있어 여유를 둔다. */
const BBOX = "37.40,126.70,37.72,127.22";

/**
 * 역간 소요시간 모델: `정차 페널티 + 거리 / 순항속도`
 *
 * 노선별 "표정속도"를 하나씩 찍는 방식은 역간거리가 짧은 노선(6호선)과
 * 긴 노선(1호선 외곽, GTX)을 동시에 맞출 수 없다. 표정속도 자체가
 * 역간거리에 종속된 값이기 때문이다.
 *
 * 대신 물리적으로 분해한다:
 *   - 정차 페널티 = 정차 시간 + 감속·가속에 추가로 드는 시간
 *   - 순항속도    = 역 사이를 실제로 달리는 속도
 * 이러면 상수 두 개로 경전철부터 GTX까지 전부 설명된다.
 *
 * 검증 (실제값 대비):
 *   2호선 순환 일주  43역 48.8km → 모델 87분 / 실제 87분
 *   1호선 서울역-인천 27역 38.9km → 모델 62분 / 실제 약 60분
 *   6호선 응암-봉화산 38역 35.1km → 모델 70분 / 실제 약 75분
 *   신분당 강남-정자   6역 18.5km → 모델 18분 / 실제 약 16분
 *   우이신설 전 구간   13역 11.4km → 모델 25분 / 실제 약 24분
 */
const LINE_CLASS = {
  /** 중전철 — 지하철 1~9호선 및 광역전철 완행 */
  heavy: { dwellSec: 60, cruiseKmh: 66 },
  /** 경전철 — 차량이 작고 가감속이 잦다 */
  light: { dwellSec: 45, cruiseKmh: 45 },
  /** 급행형 광역 — 역간거리가 길고 고속 주행 */
  rapid: { dwellSec: 50, cruiseKmh: 85 },
  /** 광역급행철도 */
  express: { dwellSec: 60, cruiseKmh: 160 },
};

const LINE_TO_CLASS = {
  "1": "heavy", "2": "heavy", "3": "heavy", "4": "heavy", "5": "heavy",
  "6": "heavy", "7": "heavy", "8": "heavy", "9": "heavy",
  "경의·중앙": "heavy",
  "수인·분당": "heavy",
  서해: "heavy",
  경강: "heavy",
  인천1: "heavy",
  신분당: "rapid",
  공항철도: "rapid",
  AREX: "rapid",
  경춘: "rapid",
  "GTX-A": "express",
  W: "light",              // 우이신설선
  Silim: "light",          // 신림선
  "김포 골드라인": "light",
  I2: "light",             // 인천 2호선
};
const DEFAULT_CLASS = "heavy";

/**
 * 직선거리 → 실제 선로거리 보정.
 * 2호선 순환선으로 캘리브레이션: 인접역 직선거리 합 47.1km vs 실제 선로 48.8km.
 */
const TRACK_FACTOR = 1.04;

/**
 * 환승 통로 도보시간 (분). OSM에는 환승 통로 소요시간 정보가 없어 상수를 쓴다.
 * 서울 지하철 실제 환승 도보는 1~10분으로 편차가 크지만, 통근 가능권을
 * 40분 단위로 판단하는 용도에서는 상수로 충분하다.
 * (열차 대기시간은 런타임 상수 TRANSFER_WAIT_MIN 으로 따로 더해진다.)
 */
const TRANSFER_WALK_MIN = 2;

/** 같은 이름 + 이 거리 안이면 같은 물리 역으로 합친다. */
const SAME_STATION_M = 600;

/**
 * 이름 태그가 없는 정차 노드를 근처 역에 붙일 때의 최대 거리.
 * 실측 최대값이 330m(공항철도 홍대입구)라 여유를 두어 400m로 잡는다.
 */
const UNNAMED_SNAP_M = 400;

/** 급행·특급은 정차역을 건너뛰므로 인접관계를 왜곡한다. 전 역 정차 계통만 쓴다. */
const VARIANT_RE = /급행|특급|셔틀|直通|Express/i;

const STOP_ROLES = new Set(["stop", "stop_entry_only", "stop_exit_only"]);

const QUERY = `
[out:json][timeout:300];
(
  rel["type"="route"]["route"~"^(subway|light_rail)$"](${BBOX});
  rel["type"="route"]["route"="train"]["network"="수도권 전철"]["service"="commuter"](${BBOX});
)->.r;
.r out body;
node(r.r)["public_transport"="stop_position"];
out body;
`;

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  const osm = await fetchOsm();

  const relations = osm.elements.filter((e) => e.type === "relation");
  const nodes = new Map(
    osm.elements.filter((e) => e.type === "node").map((n) => [n.id, n])
  );
  console.log(`OSM: 노선 계통 ${relations.length}개, 정차 노드 ${nodes.size}개`);

  const { stations, stationOfNode } = clusterStations(nodes);
  console.log(`물리 역: ${stations.length}개`);

  const adjacency = extractAdjacency(relations, nodes, stationOfNode);
  console.log(`노선: ${adjacency.size}개`);

  const graph = buildGraph(stations, adjacency);
  verify(graph);

  await writeFile(OUT, JSON.stringify(graph) + "\n");
  const size = (await stat(OUT)).size;
  console.log(`\n✓ ${OUT}`);
  console.log(`  노드 ${graph.nodes.length}개 · 엣지 ${countEdges(graph)}개 · ${(size / 1024).toFixed(0)} KB`);
}

/* ------------------------------------------------------------------ */

async function fetchOsm() {
  try {
    const cached = await readFile(CACHE, "utf8");
    console.log("OSM 캐시 사용 (다시 받으려면 data/raw/osm-subway.json 삭제)");
    return JSON.parse(cached);
  } catch {
    /* 캐시 없음 → 내려받는다 */
  }
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    for (const mirror of OVERPASS_MIRRORS) {
      const host = new URL(mirror).host;
      process.stdout.write(`Overpass 조회 (${attempt}/${MAX_ATTEMPTS}) ${host} ... `);
      try {
        const res = await fetch(mirror, {
          method: "POST",
          // Overpass는 fetch의 기본 Content-Type(text/plain)을 406으로 거부한다.
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // HTTP 헤더 값은 latin-1만 허용되므로 한글을 넣으면 안 된다.
            "User-Agent": "oneday-data-pipeline/0.1 (Seoul neighborhood map)",
          },
          body: QUERY,
        });
        if (!res.ok) {
          console.log(`실패 (HTTP ${res.status})`);
          lastError = new Error(`${host} → HTTP ${res.status}`);
          continue;
        }
        const json = await res.json();
        if (!json.elements?.length) {
          console.log("실패 (빈 응답)");
          lastError = new Error(`${host} → 빈 응답`);
          continue;
        }
        console.log(`성공 (${json.elements.length}개 요소)`);
        await mkdir(dirname(CACHE), { recursive: true });
        await writeFile(CACHE, JSON.stringify(json));
        return json;
      } catch (err) {
        console.log(`실패 (${err.message})`);
        lastError = err;
      }
    }
    if (attempt < MAX_ATTEMPTS) {
      const waitSec = attempt * 15;
      console.log(`  ${waitSec}초 후 재시도...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }
  throw new Error(`Overpass 조회 실패 (모든 미러). 마지막 오류: ${lastError?.message}`);
}

/**
 * stop_position 노드들을 물리 역으로 묶는다.
 *
 * 이름만으로 묶으면 안 된다 — 5호선 양평역(영등포구)과 경의중앙선 양평역(경기
 * 양평군)은 이름이 같지만 50km 떨어진 다른 역이다. 이름 + 근접성으로 묶는다.
 */
function clusterStations(nodes) {
  const byName = new Map();
  const unnamed = [];
  for (const n of nodes.values()) {
    const name = normalizeName(n.tags?.name);
    if (!name) {
      // 이름 태그가 없는 정차 노드가 소수 있다(공항철도 홍대입구·DMC 등).
      // 그냥 버리면 해당 노선의 정차역이 통째로 빠지므로 뒤에서 좌표로 붙인다.
      unnamed.push(n);
      continue;
    }
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(n);
  }

  const stations = [];
  const stationOfNode = new Map(); // osm node id → station index

  for (const [name, group] of byName) {
    /** @type {{lat:number,lng:number,members:any[]}[]} */
    const clusters = [];
    for (const n of group) {
      const hit = clusters.find(
        (c) => haversineM(c.lat, c.lng, n.lat, n.lon) <= SAME_STATION_M
      );
      if (hit) {
        hit.members.push(n);
        // 중심을 멤버 평균으로 갱신
        hit.lat = hit.members.reduce((s, m) => s + m.lat, 0) / hit.members.length;
        hit.lng = hit.members.reduce((s, m) => s + m.lon, 0) / hit.members.length;
      } else {
        clusters.push({ lat: n.lat, lng: n.lon, members: [n] });
      }
    }
    for (const c of clusters) {
      const id = stations.length;
      stations.push({
        id,
        name,
        lat: round6(c.lat),
        lng: round6(c.lng),
        nodeIds: [],
        lines: [],
      });
      for (const m of c.members) stationOfNode.set(m.id, id);
    }
  }

  // 이름 없는 정차 노드를 가장 가까운 역에 붙인다.
  let snapped = 0;
  for (const n of unnamed) {
    let bestId = -1;
    let bestDist = UNNAMED_SNAP_M;
    for (const st of stations) {
      const d = haversineM(n.lat, n.lon, st.lat, st.lng);
      if (d < bestDist) {
        bestDist = d;
        bestId = st.id;
      }
    }
    if (bestId >= 0) {
      stationOfNode.set(n.id, bestId);
      snapped++;
    }
  }
  if (unnamed.length) {
    console.log(`  이름 없는 정차 노드 ${unnamed.length}개 중 ${snapped}개를 인접 역에 연결`);
  }

  return { stations, stationOfNode };
}

/**
 * 역명 정규화.
 *
 * 괄호 부기명을 반드시 떼야 한다. OSM에는 같은 역이 "대림"과 "대림(구로구청)"
 * 처럼 두 이름으로 태깅된 경우가 있어서, 그대로 두면 서로 다른 역으로 갈라지고
 * **환승이 끊긴다**. 실제로 대림(2↔7), 잠실(2↔8), 교대(2↔3), 왕십리(2↔5↔경의중앙↔수인분당)
 * 가 전부 분리되어 구로·송파·성동 경로가 통째로 왜곡됐다.
 *
 *   "성신여대입구역"      → "성신여대입구"
 *   "대림(구로구청)"      → "대림"
 *   "총신대입구 (이수)"    → "총신대입구"
 */
function normalizeName(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim(); // 괄호 부기명 제거
  if (s.length > 1 && s.endsWith("역")) s = s.slice(0, -1);
  return s || null;
}

/**
 * 노선 릴레이션에서 인접 역 쌍을 뽑는다.
 * 같은 노선의 여러 운행계통(전 구간/일부 구간/지선)에서 나온 인접쌍을 합집합한다.
 */
function extractAdjacency(relations, nodes, stationOfNode) {
  /** line ref → Set("a|b") */
  const adjacency = new Map();

  for (const rel of relations) {
    const tags = rel.tags ?? {};
    const name = tags.name ?? "";
    if (VARIANT_RE.test(name)) continue; // 급행 계통은 정차역을 건너뛴다

    const line = tags.ref || tags.name;
    if (!line) continue;

    const seq = [];
    for (const m of rel.members ?? []) {
      if (m.type !== "node" || !STOP_ROLES.has(m.role)) continue;
      const sid = stationOfNode.get(m.ref);
      if (sid === undefined) continue;
      // 같은 역이 연속으로 나오면(플랫폼 중복) 접는다
      if (seq.length && seq[seq.length - 1] === sid) continue;
      seq.push(sid);
    }
    if (seq.length < 2) continue;

    if (!adjacency.has(line)) adjacency.set(line, new Set());
    const set = adjacency.get(line);
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1];
      const b = seq[i];
      if (a === b) continue;
      set.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
  }
  return adjacency;
}

function buildGraph(stations, adjacency) {
  /** `${stationId}@${line}` → nodeId */
  const nodeIndex = new Map();
  const graphNodes = [];

  const nodeIdFor = (stationId, line) => {
    const key = `${stationId}@${line}`;
    let id = nodeIndex.get(key);
    if (id === undefined) {
      id = graphNodes.length;
      graphNodes.push({ id, stationId, line });
      nodeIndex.set(key, id);
      stations[stationId].nodeIds.push(id);
      if (!stations[stationId].lines.includes(line)) {
        stations[stationId].lines.push(line);
      }
    }
    return id;
  };

  const edges = [];
  const addEdge = (from, to, min, kind, source) => {
    while (edges.length <= from) edges.push([]);
    edges[from].push({ to, min: Math.round(min * 100) / 100, kind, source });
  };

  // 1) 승차 엣지 — 같은 노선의 인접 역
  for (const [line, pairs] of adjacency) {
    const cls = LINE_CLASS[LINE_TO_CLASS[line] ?? DEFAULT_CLASS];
    for (const pair of pairs) {
      const [a, b] = pair.split("|").map(Number);
      const na = nodeIdFor(a, line);
      const nb = nodeIdFor(b, line);
      const distKm =
        (haversineM(
          stations[a].lat, stations[a].lng,
          stations[b].lat, stations[b].lng
        ) *
          TRACK_FACTOR) /
        1000;
      // 주행시간 + 도착역 정차 페널티
      const min = (distKm / cls.cruiseKmh) * 60 + cls.dwellSec / 60;
      addEdge(na, nb, min, "ride", "estimated");
      addEdge(nb, na, min, "ride", "estimated");
    }
  }

  // 2) 환승 엣지 — 같은 물리 역의 서로 다른 노선 노드끼리
  for (const st of stations) {
    for (const a of st.nodeIds) {
      for (const b of st.nodeIds) {
        if (a === b) continue;
        addEdge(a, b, TRANSFER_WALK_MIN, "transfer", "estimated");
      }
    }
  }

  while (edges.length < graphNodes.length) edges.push([]);

  // 노선이 하나도 없는 역(릴레이션에 안 잡힌 역)은 버린다.
  const used = stations.filter((s) => s.nodeIds.length > 0);
  const remap = new Map(used.map((s, i) => [s.id, i]));
  for (const s of used) s.id = remap.get(s.id);
  for (const n of graphNodes) n.stationId = remap.get(n.stationId);

  return {
    version: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap (ODbL) via Overpass API",
    note: "역간 소요시간은 역간 직선거리 × 1.1 ÷ 노선별 표정속도로 추정한 값이다.",
    stations: used,
    nodes: graphNodes,
    edges,
  };
}

/* ------------------------------------------------------------------ */

function verify(graph) {
  const problems = [];
  const { stations, nodes, edges } = graph;

  if (stations.length < 400) problems.push(`역 수가 너무 적음: ${stations.length}`);
  if (nodes.length < stations.length) problems.push(`노드 수 이상: ${nodes.length}`);
  if (edges.length !== nodes.length) {
    problems.push(`인접리스트 길이 불일치: edges=${edges.length} nodes=${nodes.length}`);
  }

  // 반드시 있어야 하는 노선 — 하나라도 빠지면 해당 자치구가 통째로 왜곡된다
  const lines = new Set(nodes.map((n) => n.line));
  for (const must of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Silim", "W", "신분당", "경의·중앙", "수인·분당", "공항철도"]) {
    if (!lines.has(must)) problems.push(`노선 누락: ${must}`);
  }

  // 대표 역들이 있어야 한다
  const names = new Set(stations.map((s) => s.name));
  for (const must of ["강남", "신림", "홍대입구", "여의도", "잠실", "서울대입구", "북한산우이", "샛강"]) {
    if (!names.has(must)) problems.push(`역 누락: ${must}`);
  }

  /*
   * 환승역이 제대로 합쳐졌는지 검사.
   *
   * OSM은 같은 역을 "대림"과 "대림(구로구청)" 처럼 두 이름으로 태깅하는 경우가
   * 있어서, 이름 정규화가 깨지면 역이 조용히 갈라지고 환승이 끊긴다. 그래도
   * 경로는 나오기 때문에(멀리 돌아가는 경로) 눈에 잘 안 띈다. 여기서 잡는다.
   */
  const KNOWN_TRANSFERS = {
    왕십리: ["2", "5", "경의·중앙", "수인·분당"],
    대림: ["2", "7"],
    잠실: ["2", "8"],
    교대: ["2", "3"],
    충정로: ["2", "5"],
    강남: ["2", "신분당"],
    신설동: ["1", "2", "W"],
    디지털미디어시티: ["6", "경의·중앙", "공항철도"],
    신도림: ["1", "2"],
    사당: ["2", "4"],
  };
  for (const [name, expected] of Object.entries(KNOWN_TRANSFERS)) {
    const matches = stations.filter((s) => s.name === name);
    if (matches.length === 0) {
      problems.push(`환승역 누락: ${name}`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(
        `환승역이 ${matches.length}개로 분리됨: ${name} — 역명 정규화를 확인할 것`
      );
      continue;
    }
    const missing = expected.filter((l) => !matches[0].lines.includes(l));
    if (missing.length) {
      problems.push(
        `${name}역 환승 끊김: ${missing.join(",")} 누락 (현재 ${matches[0].lines.join(",")})`
      );
    }
  }

  // 괄호 부기명이 남아있으면 같은 역이 갈라졌을 가능성이 크다
  const leftoverParen = stations.filter((s) => /[（(]/.test(s.name));
  if (leftoverParen.length) {
    problems.push(
      `괄호가 남은 역명 ${leftoverParen.length}개: ${leftoverParen.slice(0, 5).map((s) => s.name).join(", ")}`
    );
  }

  // 연결성 — 그래프가 쪼개져 있으면 통근시간이 Infinity 로 나온다
  const reached = bfsFrom(graph, 0);
  const ratio = reached / nodes.length;
  if (ratio < 0.9) {
    problems.push(`그래프가 분리됨: 노드의 ${(ratio * 100).toFixed(1)}%만 연결됨`);
  }

  if (problems.length) {
    console.error("\n✗ 검증 실패:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`  노선 ${lines.size}종 · 연결성 ${(ratio * 100).toFixed(1)}%`);
}

function bfsFrom(graph, start) {
  const seen = new Uint8Array(graph.nodes.length);
  const queue = [start];
  seen[start] = 1;
  let count = 1;
  while (queue.length) {
    const u = queue.pop();
    for (const e of graph.edges[u] ?? []) {
      if (!seen[e.to]) {
        seen[e.to] = 1;
        count++;
        queue.push(e.to);
      }
    }
  }
  return count;
}

const countEdges = (g) => g.edges.reduce((s, e) => s + e.length, 0);
const round6 = (v) => Math.round(v * 1e6) / 1e6;

await main();
