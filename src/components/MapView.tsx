import { useEffect, useRef } from "react";
import maplibregl, { type MapGeoJSONFeature } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { CommuteResult, DongMeta, Destination, Grade } from "../types";
import { GRADE_COLOR, GRADE_LABEL, OUT_OF_RANGE_COLOR } from "../lib/constants";

/**
 * 배경 지도 스타일.
 *
 * MapLibre GL JS(오픈소스) + CARTO 무료 베이스맵(OSM 기반). 키가 필요 없어
 * 바로 동작한다. 한국어 라벨 품질을 더 올리려면 VWorld 타일로 교체할 수 있는데,
 * 그쪽은 인증키 발급 + 도메인 등록이 필요하다 (README 참고).
 */
const BASE_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const SEOUL_CENTER: [number, number] = [126.986, 37.55];
const SEOUL_BOUNDS: [[number, number], [number, number]] = [
  [126.55, 37.34],
  [127.35, 37.78],
];

export interface DongView {
  grade: Grade;
  score: number;
  commute: CommuteResult;
  reachable: boolean;
}

interface Props {
  dongs: DongMeta[];
  views: Map<string, DongView>;
  destination: Destination | null;
  selectedCode: string | null;
  onSelect: (code: string | null) => void;
  /** 목적지가 아직 없으면 등급 대신 안내만 보여준다 */
  hasDestination: boolean;
}

const SRC_DONG = "dong";
const SRC_POINT = "dong-point";
const SRC_DEST = "dest";

export default function MapView({
  dongs,
  views,
  destination,
  selectedCode,
  onSelect,
  hasDestination,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // 최신 props를 이벤트 핸들러에서 읽기 위한 ref (핸들러를 재등록하지 않기 위함)
  const stateRef = useRef({ dongs, views, onSelect });
  stateRef.current = { dongs, views, onSelect };

  /* ---------------- 지도 생성 (1회) ---------------- */
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: SEOUL_CENTER,
      zoom: 10.4,
      maxBounds: SEOUL_BOUNDS,
      attributionControl: false,
    });
    mapRef.current = map;

    /*
     * MapLibre는 잘못된 스타일 표현식을 error 이벤트로만 알린다.
     * 리스너가 없으면 레이어가 조용히 누락된 채 지도가 빈 화면으로 남는다
     * (실제로 circle-radius 안에 zoom interpolate를 중첩했다가 초기화 전체가
     *  중단된 적이 있다). 최소한 콘솔에는 남긴다.
     */
    map.on("error", (e) => {
      console.error("[MapView] MapLibre 오류:", e.error?.message ?? e.error ?? e);
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          '경계 © 통계청 SGIS · 지하철 © OpenStreetMap',
      }),
      "bottom-right"
    );

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      maxWidth: "260px",
    });
    popupRef.current = popup;

    map.on("load", () => {
      map.addSource(SRC_DONG, {
        type: "geojson",
        data: "/seoul-dong.geojson",
        // feature-state 를 쓰려면 안정적인 feature id 가 필요하다.
        promoteId: "adm_cd2",
      });

      // 동 대표점 — 등급 아이콘을 찍을 자리 (폴리곤 내부가 보장된 좌표)
      map.addSource(SRC_POINT, {
        type: "geojson",
        data: pointsFrom(stateRef.current.dongs),
        promoteId: "code",
      });

      map.addSource(SRC_DEST, { type: "geojson", data: emptyFC() });

      /*
       * 색은 전부 feature-state 기반 표현식으로 계산한다.
       * 이렇게 하면 가중치·통근시간 슬라이더를 움직일 때 지오메트리를 다시
       * 보내지 않고 상태값만 갱신하면 되므로 427개 폴리곤도 즉시 반응한다.
       */
      map.addLayer({
        id: "dong-fill",
        type: "fill",
        source: SRC_DONG,
        paint: {
          "fill-color": gradeColorExpr(),
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.78,
            ["boolean", ["feature-state", "reachable"], false], 0.55,
            0.16,
          ],
        },
      });

      map.addLayer({
        id: "dong-outline",
        type: "line",
        source: SRC_DONG,
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false], "#ffffff",
            "rgba(255,255,255,0.22)",
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 2.2,
            0.5,
          ],
        },
      });

      /*
       * 등급 아이콘 — 통근 가능한 동에만 표시한다.
       *
       * filter 는 feature-state 를 못 읽으므로 불투명도로 숨긴다.
       * 반지름 쪽에 숨기는 로직을 넣으면 안 된다: ["zoom"] 을 쓰는
       * interpolate 는 반드시 속성 표현식의 **최상위**에 있어야 하고,
       * ["case", ..., ["interpolate", ..., ["zoom"], ...], 0] 처럼 감싸면
       * MapLibre가 레이어 추가 시 예외를 던져 이후 초기화가 통째로 중단된다.
       */
      map.addLayer({
        id: "dong-icon",
        type: "circle",
        source: SRC_POINT,
        paint: {
          "circle-color": gradeColorExpr(),
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 13, 7, 15, 9],
          "circle-opacity": reachableOpacityExpr(),
          "circle-stroke-color": "#12141a",
          "circle-stroke-width": 1.4,
          "circle-stroke-opacity": reachableOpacityExpr(),
        },
      });

      map.addLayer({
        id: "dong-label",
        type: "symbol",
        source: SRC_POINT,
        minzoom: 12.2,
        layout: {
          "text-field": ["get", "dong"],
          "text-size": 11,
          "text-offset": [0, 1.15],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": "#e8eaee",
          "text-halo-color": "#12141a",
          "text-halo-width": 1.3,
          "text-opacity": reachableOpacityExpr(),
        },
      });

      map.addLayer({
        id: "dest-marker",
        type: "circle",
        source: SRC_DEST,
        paint: {
          "circle-radius": 8,
          "circle-color": "#4d8bf5",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });

      readyRef.current = true;
      map.fire("oneday.ready");
    });

    /* 상호작용 */
    const onMove = (e: maplibregl.MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const code = String(f.id ?? "");
      const view = stateRef.current.views.get(code);
      const meta = stateRef.current.dongs.find((d) => d.code === code);
      if (!meta) return;
      popup.setLngLat(e.lngLat).setHTML(tooltipHtml(meta.name, view)).addTo(map);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };
    const onClick = (e: maplibregl.MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      stateRef.current.onSelect(f ? String(f.id ?? "") : null);
    };

    map.on("mousemove", "dong-fill", onMove);
    map.on("mouseleave", "dong-fill", onLeave);
    map.on("click", "dong-fill", onClick);

    /*
     * 컨테이너 크기 변화에 맞춰 리사이즈한다.
     *
     * 그리드 레이아웃(사이드바 폭 고정 + 지도 가변) 안에 있어서 창 크기가
     * 바뀔 때마다 필요하고, 컨테이너가 최종 크기를 갖기 전에 지도가 생성되면
     * 첫 렌더가 통째로 건너뛰어져 지도가 빈 화면으로 남는 문제도 함께 막는다.
     * (MapLibre는 렌더링할 때만 타일을 요청하므로, 첫 렌더가 없으면 타일도
     *  영영 안 불러온다.)
     */
    const ro = new ResizeObserver(() => {
      map.resize();
      map.triggerRepaint();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  /* ---------------- 등급/통근 상태 반영 ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      for (const dong of dongs) {
        const v = views.get(dong.code);
        const state = {
          grade: v?.grade ?? "normal",
          reachable: hasDestination ? (v?.reachable ?? false) : false,
        };
        map.setFeatureState({ source: SRC_DONG, id: dong.code }, state);
        map.setFeatureState({ source: SRC_POINT, id: dong.code }, state);
      }
    };

    if (readyRef.current) apply();
    else map.once("oneday.ready", apply);
  }, [dongs, views, hasDestination]);

  /* ---------------- 선택 상태 ---------------- */
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    if (prevSelected.current) {
      map.setFeatureState(
        { source: SRC_DONG, id: prevSelected.current },
        { selected: false }
      );
    }
    if (selectedCode) {
      map.setFeatureState({ source: SRC_DONG, id: selectedCode }, { selected: true });
      const meta = dongs.find((d) => d.code === selectedCode);
      if (meta) map.easeTo({ center: [meta.lng, meta.lat], duration: 500 });
    }
    prevSelected.current = selectedCode;
  }, [selectedCode, dongs]);

  /* ---------------- 목적지 마커 ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const src = map.getSource(SRC_DEST) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (!destination) {
        src.setData(emptyFC());
        return;
      }
      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [destination.lng, destination.lat] },
            properties: { name: destination.name },
          },
        ],
      });
      map.easeTo({ center: [destination.lng, destination.lat], zoom: 11.2, duration: 700 });
    };

    if (readyRef.current) apply();
    else map.once("oneday.ready", apply);
  }, [destination]);

  return <div className="map" ref={containerRef} />;
}

/* ---------------- 헬퍼 ---------------- */

/** 통근 가능한 동만 보이게 하는 불투명도 표현식 */
function reachableOpacityExpr(): maplibregl.ExpressionSpecification {
  return [
    "case",
    ["boolean", ["feature-state", "reachable"], false],
    1,
    0,
  ] as maplibregl.ExpressionSpecification;
}

/** 통근 가능하면 등급색, 아니면 회색 */
function gradeColorExpr(): maplibregl.ExpressionSpecification {
  return [
    "case",
    ["boolean", ["feature-state", "reachable"], false],
    [
      "match",
      ["feature-state", "grade"],
      "best", GRADE_COLOR.best,
      "normal", GRADE_COLOR.normal,
      "bad", GRADE_COLOR.bad,
      OUT_OF_RANGE_COLOR,
    ],
    OUT_OF_RANGE_COLOR,
  ] as maplibregl.ExpressionSpecification;
}

function pointsFrom(dongs: DongMeta[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: dongs.map((d) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [d.lng, d.lat] },
      properties: { code: d.code, dong: d.dong, gu: d.gu },
    })),
  };
}

const emptyFC = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

function tooltipHtml(name: string, view: DongView | undefined): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  if (!view || !view.reachable) {
    return `<b>${esc(name)}</b><br><span style="color:#9aa1ae">통근 가능 시간 밖</span>`;
  }
  const min = view.commute.totalMin;
  return (
    `<b>${esc(name)}</b> <span style="color:${GRADE_COLOR[view.grade]}">● ${GRADE_LABEL[view.grade]}</span>` +
    (min !== null
      ? `<br><span style="color:#9aa1ae">통근 약 ${Math.round(min)}분 · ${view.commute.viaStation}역</span>`
      : "")
  );
}
