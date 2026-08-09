import type { SubwayGraph } from "../types";
import { TRANSFER_WAIT_MIN } from "./constants";

/** Dijkstra 결과 — 노드별 최단 도달시간과 경로 특성 */
export interface ShortestPaths {
  /** nodeId → 도달시간(분). 도달 불가는 Infinity */
  dist: Float64Array;
  /** nodeId → 그 경로에서의 환승 횟수 */
  transfers: Uint8Array;
  /** nodeId → 경로에 추정 구간이 포함되었는지 */
  estimated: Uint8Array;
}

export interface Seed {
  nodeId: number;
  /** 이 노드에서 출발할 때의 초기 비용(분) — 도보 + 첫 대기 */
  cost: number;
}

/**
 * 다중 출발점 Dijkstra.
 *
 * 목적지 근처 역들을 전부 출발점으로 넣고 한 번만 돌리면, 모든 역까지의
 * "가장 빠른 경로"가 한 번에 나온다. 역마다 따로 돌릴 필요가 없다.
 *
 * 그래프가 작아서(노드 400~500, 엣지 1,500 내외) 이진 힙 없이 배열 스캔으로도
 * 충분하지만, 슬라이더 드래그처럼 반복 호출되는 경로이므로 이진 힙을 쓴다.
 * 실측 실행시간은 1ms 미만이다.
 */
export function multiSourceDijkstra(
  graph: SubwayGraph,
  seeds: Seed[]
): ShortestPaths {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const transfers = new Uint8Array(n);
  const estimated = new Uint8Array(n);

  const heap = new MinHeap(n);

  for (const seed of seeds) {
    if (seed.cost < dist[seed.nodeId]) {
      dist[seed.nodeId] = seed.cost;
      heap.push(seed.nodeId, seed.cost);
    }
  }

  while (heap.size > 0) {
    const u = heap.pop();
    const du = dist[u];
    // 힙에 남은 낡은 엔트리는 건너뛴다 (decrease-key 대신 lazy deletion)
    if (heap.lastPoppedKey > du) continue;

    const outgoing = graph.edges[u];
    if (!outgoing) continue;

    for (const e of outgoing) {
      // 환승은 통로 도보시간(e.min)에 열차 대기시간을 더해야 실제와 맞는다.
      const cost = e.kind === "transfer" ? e.min + TRANSFER_WAIT_MIN : e.min;
      const nd = du + cost;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        transfers[e.to] = transfers[u] + (e.kind === "transfer" ? 1 : 0);
        estimated[e.to] = estimated[u] || (e.source === "estimated" ? 1 : 0);
        heap.push(e.to, nd);
      }
    }
  }

  return { dist, transfers, estimated };
}

/**
 * 이진 최소 힙. decrease-key 대신 중복 push + lazy deletion을 쓴다
 * (이 규모에서는 그쪽이 더 빠르고 코드도 짧다).
 */
class MinHeap {
  private ids: Int32Array;
  private keys: Float64Array;
  size = 0;
  /** 방금 pop한 원소의 key — 낡은 엔트리 판별용 */
  lastPoppedKey = 0;

  constructor(capacityHint: number) {
    // 중복 push를 허용하므로 노드 수보다 넉넉히 잡는다.
    const cap = Math.max(16, capacityHint * 4);
    this.ids = new Int32Array(cap);
    this.keys = new Float64Array(cap);
  }

  push(id: number, key: number): void {
    if (this.size === this.ids.length) this.grow();
    let i = this.size++;
    this.ids[i] = id;
    this.keys[i] = key;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const topId = this.ids[0];
    this.lastPoppedKey = this.keys[0];
    this.size--;
    if (this.size > 0) {
      this.ids[0] = this.ids[this.size];
      this.keys[0] = this.keys[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.size && this.keys[l] < this.keys[m]) m = l;
        if (r < this.size && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return topId;
  }

  private swap(a: number, b: number): void {
    const ti = this.ids[a];
    this.ids[a] = this.ids[b];
    this.ids[b] = ti;
    const tk = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = tk;
  }

  private grow(): void {
    const ids = new Int32Array(this.ids.length * 2);
    const keys = new Float64Array(this.keys.length * 2);
    ids.set(this.ids);
    keys.set(this.keys);
    this.ids = ids;
    this.keys = keys;
  }
}
