/**
 * calibrate-walk.mjs — WALK_DETOUR_FACTOR 실측 보정 (일회성)
 *
 * 파이프라인(1→4)의 일부가 아니다. 상수 하나를 실측으로 정하기 위한
 * 측정 도구이고, 결과는 src/lib/constants.ts 에 사람이 옮겨 적는다.
 *
 * 재는 것: 서울 보행 도로망 위의 실제 최단 보행거리 ÷ 직선거리.
 * 표본: 통근 모델이 실제로 평가하는 (동 대표점 → 반경 1.5km 내 후보역) 쌍.
 *   — 임의의 두 점이 아니라 모델이 쓰는 그 쌍이어야 보정이 의미가 있다.
 *
 * 한계(결과 해석 시 반드시 감안할 것):
 *   OSM 도로 중심선을 따라 잰다. 서울은 인도(sidewalk)가 별도 way 로
 *   충분히 매핑돼 있지 않아서, 횡단보도를 찾아 돌아가는 우회가 빠진다.
 *   따라서 여기서 나온 값은 실제의 **하한**이다.
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { haversineM } from "./lib/geo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TILE_DIR = join(ROOT, "data/raw/walk-tiles");

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/** 모델과 같은 값을 써야 표본이 일치한다 (src/lib/constants.ts) */
const RADIUS_M = 1500;
const MAX_NEARBY = 6;
const CURRENT_FACTOR = 1.3;

/** 타일 한 변(도). 0.06°≈6.6km — 한 타일 응답이 대략 5~10MB 로 떨어진다. */
const TILE_DEG = 0.06;
/** 경로가 타일 밖으로 나갈 수 있으므로 타일을 이만큼 겹쳐 받는다. */
const TILE_PAD_DEG = 0.02;
/** 스냅 허용 거리. 이보다 멀면 그 지점 근처에 도로망이 없다는 뜻이라 버린다. */
const MAX_SNAP_M = 150;

/**
 * 보행 가능한 way 만 고른다.
 * motorway/motorway_link 는 애초에 제외하고, foot=no 와 사유지도 뺀다.
 * area=yes 는 광장 폴리곤이라 선형 경로로 쓰면 안 된다.
 */
const HIGHWAY_RE =
  "^(footway|path|pedestrian|steps|living_street|residential|unclassified|service|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|trunk|trunk_link|road|track)$";

async function main() {
  const dongs = JSON.parse(await readFile(join(ROOT, "data/dist/dong-meta.json"), "utf8")).dongs;
  const stations = JSON.parse(await readFile(join(ROOT, "data/dist/subway-graph.json"), "utf8")).stations;

  console.log("[1/4] 필요한 타일 계산...");
  const tiles = planTiles(dongs);
  console.log(`  ${tiles.length}개 타일 (동 427개 + 반경 ${RADIUS_M}m 를 덮는 범위)`);

  console.log("[2/4] 보행 도로망 수집 (캐시 우선)...");
  await mkdir(TILE_DIR, { recursive: true });
  const graph = await buildGraphFromTiles(tiles);
  console.log(`  노드 ${graph.nodes.count.toLocaleString()} / 링크 ${graph.linkCount.toLocaleString()}`);

  console.log("[3/4] 최단 보행거리 측정...");
  const rows = measure(graph, dongs, stations);

  // 재분석이 잦다. 그래프를 다시 세우는 데 몇 분이 걸리므로 측정 결과를 떨궈둔다.
  await writeFile(join(ROOT, "data/raw/walk-calibration-rows.json"), JSON.stringify(rows));

  console.log("[4/4] 결과");
  report(rows, dongs.length);
}

/** 동 대표점들을 덮는 타일 격자. 빈 바다/산 타일은 만들지 않는다. */
function planTiles(dongs) {
  const pad = RADIUS_M / 111000; // 반경만큼 여유
  const keys = new Set();
  for (const d of dongs) {
    for (const dl of [-pad, 0, pad]) {
      for (const dg of [-pad, 0, pad]) {
        keys.add(`${Math.floor((d.lat + dl) / TILE_DEG)},${Math.floor((d.lng + dg) / TILE_DEG)}`);
      }
    }
  }
  return [...keys].map((k) => {
    const [i, j] = k.split(",").map(Number);
    return {
      key: k.replace(",", "_"),
      south: i * TILE_DEG - TILE_PAD_DEG,
      west: j * TILE_DEG - TILE_PAD_DEG,
      north: (i + 1) * TILE_DEG + TILE_PAD_DEG,
      east: (j + 1) * TILE_DEG + TILE_PAD_DEG,
    };
  });
}

async function buildGraphFromTiles(tiles) {
  // 좌표 → 노드 인덱스. out geom 은 노드 ID를 안 주지만, 공유 노드는 좌표가
  // 완전히 같게 나오므로 좌표 문자열이 곧 노드 식별자가 된다.
  // (타일을 겹쳐 받아 같은 way 가 여러 번 나와도 이걸로 자동 병합된다.)
  const nodeKey = new Map();
  const lat = [], lng = [], adj = [];
  let linkCount = 0;
  const seenLink = new Set();

  const nid = (la, lo) => {
    const k = `${la.toFixed(7)},${lo.toFixed(7)}`;
    let i = nodeKey.get(k);
    if (i === undefined) { i = lat.length; nodeKey.set(k, i); lat.push(la); lng.push(lo); adj.push([]); }
    return i;
  };

  for (let t = 0; t < tiles.length; t++) {
    const tile = tiles[t];
    const json = await fetchTile(tile, t + 1, tiles.length);
    for (const e of json.elements) {
      if (e.type !== "way" || !e.geometry) continue;
      for (let i = 1; i < e.geometry.length; i++) {
        const a = e.geometry[i - 1], b = e.geometry[i];
        const u = nid(a.lat, a.lon), v = nid(b.lat, b.lon);
        if (u === v) continue;
        const lk = u < v ? `${u}:${v}` : `${v}:${u}`;
        if (seenLink.has(lk)) continue; // 겹친 타일에서 온 중복
        seenLink.add(lk);
        const w = haversineM(a.lat, a.lon, b.lat, b.lon);
        adj[u].push(v, w);   // 평탄 배열 — 객체 80만 개를 만들면 메모리가 튄다
        adj[v].push(u, w);
        linkCount++;
      }
    }
  }
  return { nodes: { lat, lng, count: lat.length }, adj, linkCount };
}

async function fetchTile(tile, n, total) {
  const path = join(TILE_DIR, `${tile.key}.json`);
  try {
    const raw = await readFile(path, "utf8");
    process.stdout.write(`  [${n}/${total}] ${tile.key} 캐시\r`);
    return JSON.parse(raw);
  } catch { /* 캐시 없음 → 받는다 */ }

  const query = `[out:json][timeout:300];
(way["highway"~"${HIGHWAY_RE}"]["foot"!="no"]["access"!~"^(private|no)$"]["area"!="yes"](${tile.south},${tile.west},${tile.north},${tile.east}););
out geom;`;

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const mirror of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(mirror, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          headers: { "User-Agent": "oneday-data-pipeline/0.1 (Seoul neighborhood map)" },
          signal: AbortSignal.timeout(320_000),
        });
        if (!res.ok) continue;
        const text = await res.text();
        if (!text.startsWith("{")) continue; // 서버 과부하 시 HTML 오류 페이지가 온다
        const json = JSON.parse(text);
        if (!Array.isArray(json.elements)) continue;
        await writeFile(path, text);
        console.log(`  [${n}/${total}] ${tile.key} ${(text.length / 1e6).toFixed(1)}MB (${json.elements.length} way)`);
        return json;
      } catch { /* 다음 미러 */ }
    }
    // 공개 인스턴스에 예의를 지킨다 — 몰아치지 않는다
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error(`타일 ${tile.key} 수집 실패 — 잠시 후 다시 실행하면 캐시된 타일은 건너뛴다`);
}

/** 좌표 → 최근접 노드 (격자 버킷). 전수 탐색은 수십만 노드에서 못 쓴다. */
function makeSnapper(nodes, cellDeg = 0.003) {
  const cells = new Map();
  for (let i = 0; i < nodes.count; i++) {
    const k = `${Math.floor(nodes.lat[i] / cellDeg)},${Math.floor(nodes.lng[i] / cellDeg)}`;
    let c = cells.get(k); if (!c) cells.set(k, (c = []));
    c.push(i);
  }
  return (la, lo, maxRing = 4) => {
    const ci = Math.floor(la / cellDeg), cj = Math.floor(lo / cellDeg);
    let best = -1, bestM = Infinity;
    for (let r = 0; r <= maxRing; r++) {
      for (let di = -r; di <= r; di++)
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          for (const i of cells.get(`${ci + di},${cj + dj}`) ?? []) {
            const m = haversineM(la, lo, nodes.lat[i], nodes.lng[i]);
            if (m < bestM) { bestM = m; best = i; }
          }
        }
      if (best >= 0 && bestM <= r * cellDeg * 111000) break;
    }
    return { node: best, snapM: bestM };
  };
}

class Heap {
  constructor() { this.n = []; this.d = []; }
  push(n, d) {
    this.n.push(n); this.d.push(d);
    let i = this.n.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.d[p] <= this.d[i]) break; this.#swap(p, i); i = p; }
  }
  pop() {
    const rn = this.n[0], rd = this.d[0];
    const ln = this.n.pop(), ld = this.d.pop();
    if (this.n.length) {
      this.n[0] = ln; this.d[0] = ld;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let s = i;
        if (l < this.n.length && this.d[l] < this.d[s]) s = l;
        if (r < this.n.length && this.d[r] < this.d[s]) s = r;
        if (s === i) break; this.#swap(s, i); i = s;
      }
    }
    return [rn, rd];
  }
  #swap(a, b) {
    [this.n[a], this.n[b]] = [this.n[b], this.n[a]];
    [this.d[a], this.d[b]] = [this.d[b], this.d[a]];
  }
  get size() { return this.n.length; }
}

function measure(graph, dongs, stations) {
  const snap = makeSnapper(graph.nodes);
  const dist = new Float64Array(graph.nodes.count);
  const rows = [];
  let noStation = 0, unreachable = 0, badSnap = 0;

  for (const d of dongs) {
    const near = stations
      .map((s) => ({ s, m: haversineM(d.lat, d.lng, s.lat, s.lng) }))
      .filter((x) => x.m <= RADIUS_M)
      .sort((a, b) => a.m - b.m)
      .slice(0, MAX_NEARBY);
    if (!near.length) { noStation++; continue; }

    const src = snap(d.lat, d.lng);
    if (src.node < 0 || src.snapM > MAX_SNAP_M) { badSnap++; continue; }

    dist.fill(Infinity);
    dist[src.node] = 0;
    const h = new Heap(); h.push(src.node, 0);
    const limit = RADIUS_M * 3; // 직선 1.5km 쌍이 목표라 3km 넘게 볼 이유가 없다
    while (h.size) {
      const [n, dd] = h.pop();
      if (dd > dist[n]) continue;
      if (dd > limit) break;
      const a = graph.adj[n];
      for (let i = 0; i < a.length; i += 2) {
        const to = a[i], nd = dd + a[i + 1];
        if (nd < dist[to]) { dist[to] = nd; h.push(to, nd); }
      }
    }

    for (const { s, m } of near) {
      const t = snap(s.lat, s.lng);
      if (t.node < 0 || t.snapM > MAX_SNAP_M) { badSnap++; continue; }
      const net = dist[t.node];
      if (!isFinite(net)) { unreachable++; continue; }
      // 스냅으로 잘려나간 양 끝을 되돌려 "대표점 → 역" 전체 거리로 맞춘다
      rows.push({
        dong: d.name, station: s.name,
        straight: m, walk: net + src.snapM + t.snapM,
      });
    }
  }
  console.log(`  측정 ${rows.length}쌍 / 역없음 ${noStation}동 / 도달불가 ${unreachable} / 스냅실패 ${badSnap}`);
  return rows;
}

function summarize(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.floor((s.length - 1) * p)];
  return {
    n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length,
    p10: q(0.1), p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9),
  };
}

function report(rows, dongCount) {
  const ratios = rows.map((r) => r.walk / r.straight);
  const s = summarize(ratios);
  const totalRatio = rows.reduce((a, r) => a + r.walk, 0) / rows.reduce((a, r) => a + r.straight, 0);

  console.log(`\n  실제 보행거리 ÷ 직선거리  (n=${s.n}, 동 ${dongCount}개 기준)`);
  console.log(`    평균 ${s.mean.toFixed(3)}   중앙 ${s.median.toFixed(3)}`);
  console.log(`    p10 ${s.p10.toFixed(3)} / p25 ${s.p25.toFixed(3)} / p75 ${s.p75.toFixed(3)} / p90 ${s.p90.toFixed(3)}`);
  console.log(`    총거리 기준(Σ보행÷Σ직선) ${totalRatio.toFixed(3)}   ← 단일 계수로 총 도보거리를 맞추는 값`);
  console.log(`\n  현재 상수 ${CURRENT_FACTOR}`);

  console.log(`\n  거리 구간별 중앙 비율`);
  for (const [lo, hi] of [[0, 300], [300, 600], [600, 900], [900, 1200], [1200, 1500]]) {
    const sub = rows.filter((r) => r.straight >= lo && r.straight < hi).map((r) => r.walk / r.straight);
    if (sub.length < 5) { console.log(`    ${lo}~${hi}m: 표본 ${sub.length}개 (부족)`); continue; }
    console.log(`    ${lo}~${hi}m: ${summarize(sub).median.toFixed(3)}  (n=${sub.length})`);
  }

  // 계수를 바꾸면 도보시간이 얼마나 움직이는지 — 통근권 40분 컷 근처가 관심사다
  const cand = totalRatio;
  console.log(`\n  계수를 ${CURRENT_FACTOR} → ${cand.toFixed(2)} 로 바꿀 때 도보시간 변화`);
  for (const m of [300, 500, 800, 1200]) {
    const before = (m * CURRENT_FACTOR) / 67, after = (m * cand) / 67;
    console.log(`    직선 ${m}m: ${before.toFixed(1)}분 → ${after.toFixed(1)}분 (+${(after - before).toFixed(1)})`);
  }

  const worst = [...rows].sort((a, b) => b.walk / b.straight - a.walk / a.straight).slice(0, 5);
  console.log(`\n  우회가 가장 심한 5쌍 (하천·철도·구릉 등으로 끊긴 곳)`);
  for (const r of worst)
    console.log(`    ${r.dong} → ${r.station}역: 직선 ${r.straight.toFixed(0)}m / 보행 ${r.walk.toFixed(0)}m = ${(r.walk / r.straight).toFixed(2)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
