import { useEffect, useRef, useState } from "react";
import maplibregl, { type MapGeoJSONFeature } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { CommuteResult, DongMeta, Destination, Grade } from "../types";
import {
  COMMUTE_BANDS,
  GRADE_COLOR,
  GRADE_LABEL,
  OUT_OF_RANGE_COLOR,
} from "../lib/constants";
import { LINE_COLOR, lineName, type SubwayLayers } from "../lib/subwayLines";

/**
 * 배경 지도 스타일.
 *
 * MapLibre GL JS(오픈소스) + CARTO 무료 베이스맵(OSM 기반). 키가 필요 없어
 * 바로 동작한다. 한국어 라벨 품질을 더 올리려면 VWorld 타일로 교체할 수 있는데,
 * 그쪽은 인증키 발급 + 도메인 등록이 필요하다 (docs/development.md 참고).
 */
const BASE_STYLE = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
} as const;

export type Theme = "dark" | "light";

/**
 * 테마별 지도 요소 색.
 *
 * 어두운 배경에서 쓰던 값을 밝은 배경에 그대로 두면 안 된다. 환승역 흰 점은
 * 아예 안 보이고, 라벨 halo 가 글자를 갉아먹는다.
 */
const MAP_THEME = {
  dark: {
    transferFill: "#ffffff",
    stationStroke: "#12141a",
    halo: "#12141a",
    dongLabel: "#e8eaee",
    stationLabel: "#b9c0cc",
    dongOutline: "rgba(255,255,255,0.22)",
    selectedOutline: "#ffffff",
    route: "#7fb0ff",
  },
  light: {
    // 흰 점은 밝은 배경에서 사라진다. 라이트에서는 반대로 어둡게 칠한다
    transferFill: "#3a4150",
    stationStroke: "#ffffff",
    halo: "#ffffff",
    dongLabel: "#2a2f38",
    stationLabel: "#555c68",
    dongOutline: "rgba(0,0,0,0.20)",
    selectedOutline: "#1b1f26",
    route: "#1d5fd0",
  },
} as const;

/*
 * 대상 지역 전체(서울 + 수원·성남·용인)를 담는 범위.
 *
 * 폴리곤 실측이 위도 37.216~37.701, 경도 126.765~127.196 이다. 서울만 볼 때의
 * 남쪽 한계는 37.34 였는데 그대로 두면 수원·용인이 14km 잘린다.
 *
 * 중심은 두 지역의 기하학적 중앙(37.458)이 아니라 조금 북쪽으로 둔다 —
 * 동의 78%가 서울에 있어 첫 화면에서 서울이 너무 작아지면 안 된다.
 */
const MAP_CENTER: [number, number] = [126.99, 37.5];
const MAP_BOUNDS: [[number, number], [number, number]] = [
  [126.7, 37.16],
  [127.26, 37.76],
];

export type MapMode = "grade" | "commute";

/**
 * 통근 경로를 이루는 선분 하나.
 *
 * 지하철·버스·도보를 나눠 넘기는 이유: MapLibre 의 line-dasharray 는
 * data-driven 표현식을 못 받아서 한 레이어 안에서 점선 모양을 구간별로
 * 다르게 줄 수 없다. 그래서 kind 를 피처 속성으로 싣고 레이어를 갈라
 * filter 로 나눠 그린다.
 */
export interface RouteSegment {
  kind: "ride" | "bus" | "walk";
  coords: Array<[number, number]>;
}

export interface DongView {
  grade: Grade;
  score: number;
  /** 통근시간 밴드 인덱스 (COMMUTE_BANDS). 도달 불가면 -1 */
  band: number;
  /**
   * worstMin 을 만든 그 목적지의 상세 (툴팁의 "○○역 경유" 표기용).
   * 임의로 첫 번째 목적지 걸 쓰면 "70분 · 강남역 경유"처럼 시간은 A 목적지,
   * 역은 B 목적지 걸 보여주는 식으로 서로 다른 목적지가 섞여 표시된다.
   */
  commute: CommuteResult;
  /** 모든 목적지 중 가장 오래 걸리는 시간 — 통근권 판정과 툴팁 숫자에 쓴다 */
  worstMin: number | null;
  reachable: boolean;
  /** 통근은 되는데 예산에서 걸린 경우 — 툴팁이 이유를 구분해 알려준다 */
  overBudget: boolean;
  /** 툴팁에 띄울 한 줄 이유 — 지도만 훑어도 왜 그 등급인지 알 수 있게 */
  reason: string;
}

interface Props {
  dongs: DongMeta[];
  views: Map<string, DongView>;
  /** 목적지 (최대 3개). 지도에는 전부 마커로 찍는다 */
  destinations: Destination[];
  selectedCode: string | null;
  onSelect: (code: string | null) => void;
  /** 목적지가 아직 없으면 등급 대신 안내만 보여준다 */
  hasDestination: boolean;
  /** 선택된 동의 통근 경로. 지하철 구간과 도보 구간을 나눠 그린다 */
  routePath: RouteSegment[];
  /** 지하철 노선도 (노선별 MultiLineString + 역 Point) */
  subway: SubwayLayers;
  showSubway: boolean;
  /**
   * 표시할 노선. null 이면 전부 표시한다.
   * (범례에 없는 비주요 노선까지 일일이 상태로 들고 있지 않기 위한 구분)
   */
  visibleLines: string[] | null;
  /** 색이 무엇을 뜻하는지 — 등급이냐 통근시간이냐 */
  mapMode: MapMode;
  theme: Theme;
  /** 지도의 역을 클릭했을 때 — 목적지로 추가한다 */
  onPickStation: (station: { name: string; lat: number; lng: number }) => void;
}

const SRC_DONG = "dong";
const SRC_POINT = "dong-point";
const SRC_DEST = "dest";
const SRC_ROUTE = "route";
const SRC_SUBWAY_LINE = "subway-line-src";
const SRC_SUBWAY_STATION = "subway-station-src";

/** 토글로 함께 켜고 끄는 지하철 레이어들 */
const SUBWAY_LAYERS = ["subway-line", "subway-hit", "subway-station", "subway-label"];

export default function MapView({
  dongs,
  views,
  destinations,
  selectedCode,
  onSelect,
  hasDestination,
  routePath,
  subway,
  showSubway,
  visibleLines,
  mapMode,
  theme,
  onPickStation,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  /** 테마 전환 후 레이어를 다시 깔기 위해 설치 함수를 들고 있는다 */
  const installRef = useRef<(() => void) | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  /**
   * 스타일을 갈아끼울 때마다 올라간다.
   *
   * 아래 상태 반영 effect 들은 readyRef 가 이미 true 면 즉시 적용하고 끝내므로,
   * 테마 전환으로 레이어가 새로 깔려도 자기 힘으로는 다시 걸리지 않는다.
   * 이 값을 의존성에 넣어 재실행시킨다.
   */
  const [styleEpoch, setStyleEpoch] = useState(0);

  // 최신 props를 이벤트 핸들러에서 읽기 위한 ref (핸들러를 재등록하지 않기 위함)
  const stateRef = useRef({ dongs, views, onSelect, onPickStation, hasDestination });
  stateRef.current = { dongs, views, onSelect, onPickStation, hasDestination };

  // 지하철 노선도는 불변이므로 지도 생성 시점에 한 번만 읽는다
  const subwayRef = useRef(subway);
  subwayRef.current = subway;

  /* ---------------- 지도 생성 (1회) ---------------- */
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE[themeRef.current],
      center: MAP_CENTER,
      // 서울만일 때는 10.4 였다. 남북이 14km 늘어 그대로 두면 아래가 잘린다.
      zoom: 9.9,
      maxBounds: MAP_BOUNDS,
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
          "경계 © SGIS/vuski · 100m 인구(2024) © 국가데이터처 SGIS · 지하철 © OpenStreetMap · 버스 © 서울특별시·경기도",
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

    /**
     * 소스와 레이어를 설치한다.
     *
     * 함수로 뽑아둔 이유: 테마를 바꾸면 배경지도 스타일을 통째로 교체하는데,
     * MapLibre 는 setStyle 시 커스텀 소스·레이어를 **보존하지 않는다.**
     * 여기 있는 것들이 전부 사라지므로 styledata 이후 다시 불러야 한다.
     */
    const installLayers = () => {
    map.addSource(SRC_DONG, {
      type: "geojson",
      data: "/dong.geojson",
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
    map.addSource(SRC_ROUTE, { type: "geojson", data: emptyFC() });

    // 지하철 노선도는 세션 내내 불변이라 한 번만 넣는다
    map.addSource(SRC_SUBWAY_LINE, { type: "geojson", data: subwayRef.current.lines });
    map.addSource(SRC_SUBWAY_STATION, {
      type: "geojson",
      data: subwayRef.current.stations,
    });

    /*
     * 색은 전부 feature-state 기반 표현식으로 계산한다.
     * 이렇게 하면 가중치·통근시간 슬라이더를 움직일 때 지오메트리를 다시
     * 보내지 않고 상태값만 갱신하면 되므로 547개 폴리곤도 즉시 반응한다.
     */
    map.addLayer({
      id: "dong-fill",
      type: "fill",
      source: SRC_DONG,
      paint: {
        "fill-color": fillColorExpr("grade"),
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
          ["boolean", ["feature-state", "selected"], false], MAP_THEME[themeRef.current].selectedOutline,
          MAP_THEME[themeRef.current].dongOutline,
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false], 2.2,
          0.5,
        ],
      },
    });

    /*
     * 지하철 노선도.
     *
     * 등급 아이콘보다 **아래**에 깐다. 이 앱의 주인공은 등급이고 지하철은
     * 그걸 설명하는 배경이라, 역 점이 등급 아이콘을 가리면 주 기능이 손상된다.
     * 선은 등급 색을 덮지 않을 만큼 얇고 반투명하게 둔다.
     */
    map.addLayer({
      id: "subway-line",
      type: "line",
      source: SRC_SUBWAY_LINE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 13, 2.2, 16, 4],
        "line-opacity": 0.85,
      },
    });

    /*
     * hover 판정용 히트박스.
     *
     * 실제 노선은 줌 10에서 1.2px 라 커서로 맞히는 게 사실상 불가능하다.
     * 투명한 두꺼운 선을 같은 소스로 하나 더 깔아 여기서 hover 를 받는다.
     */
    map.addLayer({
      id: "subway-hit",
      type: "line",
      source: SRC_SUBWAY_LINE,
      paint: { "line-color": "#000000", "line-width": 12, "line-opacity": 0 },
    });

    map.addLayer({
      id: "subway-station",
      type: "circle",
      source: SRC_SUBWAY_STATION,
      paint: {
        /*
         * 환승역은 데이터에 흰색으로 박혀 있는데(노선도 관례) 밝은 배경에서는
         * 사라진다. 테마가 라이트면 어두운 색으로 뒤집는다.
         */
        "circle-color": [
          "case",
          ["boolean", ["get", "isTransfer"], false],
          MAP_THEME[themeRef.current].transferFill,
          ["get", "color"],
        ],
        // 등급 아이콘(3.5~9)보다 확실히 작아야 둘이 구분된다
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          10, ["case", ["get", "isTransfer"], 2, 1.4],
          13, ["case", ["get", "isTransfer"], 3.2, 2.2],
          16, ["case", ["get", "isTransfer"], 5, 3.6],
        ],
        "circle-stroke-color": MAP_THEME[themeRef.current].stationStroke,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.2],
        "circle-opacity": 0.95,
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
        "circle-color": fillColorExpr("grade"),
        /*
         * 통근권 안에 동이 150개 넘게 들어오므로 점이 조금만 커도 지도를 덮는다.
         * 아래 역 점보다는 확실히 커야 둘이 구분된다 (역 최대 2.0/3.2/5).
         */
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.4, 13, 4.5, 15, 6],
        "circle-opacity": reachableOpacityExpr(),
        "circle-stroke-color": MAP_THEME[themeRef.current].halo,
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
        "text-color": MAP_THEME[themeRef.current].dongLabel,
        "text-halo-color": MAP_THEME[themeRef.current].halo,
        "text-halo-width": 1.3,
        "text-opacity": reachableOpacityExpr(),
      },
    });

    /*
     * 통근 경로.
     *
     * 역 좌표를 직선으로 이은 것이지 실제 선로 모양이 아니다. 실선으로 그리면
     * 실제 노선처럼 보여 정확도를 오해하므로 점선으로 그리고, 사이드바에도
     * 추정치임을 적어둔다.
     *
     * 1호선(남색) 등 어두운 노선색과 겹치면 파란 경로선이 묻혀 안 보이는
     * 문제가 있어, 라벨 halo와 같은 원리로 배경색 테두리(casing)를 먼저
     * 깔고 그 위에 원래 색 점선을 그린다 — 밑에 뭐가 있든 그 구간만
     * 지워내는 효과라 노선색·건물색 어디에 겹쳐도 도드라진다.
     */
    map.addLayer({
      id: "route-line-casing",
      type: "line",
      source: SRC_ROUTE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_THEME[themeRef.current].halo,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4.5, 14, 7],
        "line-dasharray": [2, 1.6],
        "line-opacity": 0.95,
      },
    });

    /*
     * 도보 구간. 지하철보다 먼저(=아래) 깔아 교차 지점에서 지하철이 위로
     * 오게 한다.
     *
     * 이건 **실제 보행로가 아니라 직선**이다. 통근 계산 자체가 도보를
     * 직선거리 × 보정계수로 잡으므로 직선이 계산과 일치한다. 다만 그림만
     * 봐서는 길처럼 오해할 수 있어, 지하철 구간보다 가늘고 촘촘한 점선에
     * 투명도를 낮춰 "대략 이 방향으로 이만큼"으로 읽히게 한다.
     */
    map.addLayer({
      id: "route-walk-line",
      type: "line",
      source: SRC_ROUTE,
      filter: ["==", ["get", "kind"], "walk"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_THEME[themeRef.current].route,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 14, 2.6],
        "line-dasharray": [0.6, 1.8],
        "line-opacity": 0.75,
      },
    });
    map.addLayer({
      id: "route-bus-line",
      type: "line",
      source: SRC_ROUTE,
      filter: ["==", ["get", "kind"], "bus"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#2f9e82",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 4],
        "line-dasharray": [0.9, 1.2],
        "line-opacity": 0.95,
      },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: SRC_ROUTE,
      filter: ["==", ["get", "kind"], "ride"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_THEME[themeRef.current].route,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 4],
        "line-dasharray": [2, 1.6],
        "line-opacity": 0.9,
      },
    });

    /*
     * 역 이름. dong-label(minzoom 12.2)이 먼저 선언되어 있어 충돌 시 동 이름이
     * 우선한다 — 이 앱에서 더 중요한 건 동네 이름이므로 의도한 순서다.
     */
    map.addLayer({
      id: "subway-label",
      type: "symbol",
      source: SRC_SUBWAY_STATION,
      minzoom: 13,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 10.5,
        "text-offset": [0, -1.2],
        "text-anchor": "bottom",
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": MAP_THEME[themeRef.current].stationLabel,
        "text-halo-color": MAP_THEME[themeRef.current].halo,
        "text-halo-width": 1.4,
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

      readyRef.current = true;
      map.fire("oneday.ready");
    };

    map.on("load", installLayers);
    installRef.current = installLayers;

    /* 상호작용 */
    const onMove = (e: maplibregl.MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const code = String(f.id ?? "");
      const view = stateRef.current.views.get(code);
      const meta = stateRef.current.dongs.find((d) => d.code === code);
      if (!meta) return;
      const html = tooltipHtml(meta.name, view, stateRef.current.hasDestination);
      popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };
    const onClick = (e: maplibregl.MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      stateRef.current.onSelect(f ? String(f.id ?? "") : null);
    };

    /* 노선 hover → 노선명 */
    const onLineMove = (
      e: maplibregl.MapMouseEvent & { features?: MapGeoJSONFeature[] }
    ) => {
      const line = e.features?.[0]?.properties?.line;
      if (!line) return;
      map.getCanvas().style.cursor = "pointer";
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<b style="color:${LINE_COLOR[line] ?? "#fff"}">●</b> ${escapeHtml(lineName(line))}`
        )
        .addTo(map);
    };

    /* 역 hover / 클릭 → 목적지 지정 */
    const onStationMove = (
      e: maplibregl.MapMouseEvent & { features?: MapGeoJSONFeature[] }
    ) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      map.getCanvas().style.cursor = "pointer";
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<b>${escapeHtml(String(p.name))}역</b>` +
            `<br><span style="color:#9aa1ae">클릭하면 목적지로 추가</span>`
        )
        .addTo(map);
    };
    const onStationClick = (
      e: maplibregl.MapMouseEvent & { features?: MapGeoJSONFeature[] }
    ) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      // 역 클릭이 아래 동 폴리곤 클릭까지 발동시키면 선택이 덮어써진다
      e.preventDefault();
      stateRef.current.onPickStation({ name: `${f.properties.name}역`, lat, lng });
    };

    map.on("mousemove", "dong-fill", onMove);
    map.on("mouseleave", "dong-fill", onLeave);
    map.on("click", "dong-fill", onClick);
    map.on("mousemove", "subway-hit", onLineMove);
    map.on("mouseleave", "subway-hit", onLeave);
    // 역이 노선보다 위에 있어야 겹칠 때 역 팝업이 이긴다
    map.on("mousemove", "subway-station", onStationMove);
    map.on("mouseleave", "subway-station", onLeave);
    map.on("click", "subway-station", onStationClick);

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
          band: v?.band ?? -1,
          reachable: hasDestination ? (v?.reachable ?? false) : false,
        };
        map.setFeatureState({ source: SRC_DONG, id: dong.code }, state);
        map.setFeatureState({ source: SRC_POINT, id: dong.code }, state);
      }
    };

    if (readyRef.current) apply();
    else map.once("oneday.ready", apply);
  }, [dongs, views, hasDestination, styleEpoch]);

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
      if (meta) map.easeTo({ center: markerCoord(meta), duration: 500 });
    }
    prevSelected.current = selectedCode;
  }, [selectedCode, dongs, styleEpoch]);

  /* ---------------- 목적지 마커 ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const src = map.getSource(SRC_DEST) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (destinations.length === 0) {
        src.setData(emptyFC());
        return;
      }
      src.setData({
        type: "FeatureCollection",
        features: destinations.map((d) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [d.lng, d.lat] },
          properties: { name: d.name },
        })),
      });
      // 목적지가 여럿이면 전부 보이도록 맞춘다
      if (destinations.length === 1) {
        const d = destinations[0];
        map.easeTo({ center: [d.lng, d.lat], zoom: 11.2, duration: 700 });
      } else {
        const b = new maplibregl.LngLatBounds();
        for (const d of destinations) b.extend([d.lng, d.lat]);
        map.fitBounds(b, { padding: 120, maxZoom: 12, duration: 700 });
      }
    };

    if (readyRef.current) apply();
    else map.once("oneday.ready", apply);
  }, [destinations, styleEpoch]);

  /* ---------------- 지하철 표시/숨김 ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // 소스와 레이어는 그대로 두고 visibility 만 바꾼다 — 껐다 켜도 재생성 비용이 없다
      for (const id of SUBWAY_LAYERS) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", showSubway ? "visible" : "none");
        }
      }
    };

    if (readyRef.current) apply();
    else map.once("oneday.ready", apply);
  }, [showSubway, styleEpoch]);

  /* ---------------- 테마 전환 ---------------- */
  const prevTheme = useRef(theme);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || prevTheme.current === theme) return;
    prevTheme.current = theme;

    /*
     * 배경지도를 통째로 갈아끼운다.
     *
     * MapLibre 는 setStyle 시 커스텀 소스·레이어를 **보존하지 않는다.** 내가 올린
     * 레이어 9개와 소스 5개가 전부 사라지므로 styledata 이후 다시 설치해야 하고,
     * feature-state 도 함께 날아가므로 등급 상태를 다시 태워야 한다.
     * (등급 반영 effect 가 oneday.ready 를 듣고 있어 자동으로 다시 걸린다)
     */
    readyRef.current = false;
    map.setStyle(BASE_STYLE[theme]);
    map.once("styledata", () => {
      installRef.current?.();
      setStyleEpoch((n) => n + 1);
    });
  }, [theme]);

  /* ---------------- 지도 모드 (등급 / 통근시간) ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("dong-fill")) return;
      // 지오메트리와 feature-state 는 그대로 두고 색 표현식만 갈아끼운다
      map.setPaintProperty("dong-fill", "fill-color", fillColorExpr(mapMode));
      map.setPaintProperty("dong-icon", "circle-color", fillColorExpr(mapMode));
    };
    if (readyRef.current) apply();
    else map.once("oneday.ready", apply);
  }, [mapMode, styleEpoch]);

  /* ---------------- 노선별 표시/숨김 ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getLayer("subway-line")) return;

      if (visibleLines === null) {
        for (const id of ["subway-line", "subway-hit"]) map.setFilter(id, null);
        for (const id of ["subway-station", "subway-label"]) map.setFilter(id, null);
        return;
      }

      const lineFilter: maplibregl.FilterSpecification = [
        "in",
        ["get", "line"],
        ["literal", visibleLines],
      ];
      for (const id of ["subway-line", "subway-hit"]) map.setFilter(id, lineFilter);

      /*
       * 역은 환승역이면 무조건 남긴다. 다른 노선이 살아 있는 한 그 역은 지도에
       * 있어야 하고, 환승역은 노선이 여럿이라 하나로 필터할 수도 없다.
       */
      const stationFilter: maplibregl.FilterSpecification = [
        "any",
        ["boolean", ["get", "isTransfer"], false],
        ["in", ["get", "primaryLine"], ["literal", visibleLines]],
      ];
      for (const id of ["subway-station", "subway-label"]) {
        map.setFilter(id, stationFilter);
      }
    };

    if (readyRef.current) apply();
    else map.once("oneday.ready", apply);
  }, [visibleLines, styleEpoch]);

  /* ---------------- 통근 경로선 ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const src = map.getSource(SRC_ROUTE) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: routePath
          .filter((seg) => seg.coords.length >= 2)
          .map((seg) => ({
            type: "Feature",
            geometry: { type: "LineString", coordinates: seg.coords },
            // 레이어가 이 값으로 갈린다 (지하철 / 버스 / 도보)
            properties: { kind: seg.kind },
          })),
      });
    };

    if (readyRef.current) apply();
    else map.once("oneday.ready", apply);
  }, [routePath, styleEpoch]);

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

/**
 * 조건을 통과한 동만 색칠하고 나머지는 회색으로 둔다.
 * 색이 뜻하는 바는 모드가 정한다 — 등급이냐 통근시간이냐.
 */
function fillColorExpr(mode: MapMode): maplibregl.ExpressionSpecification {
  const inner: maplibregl.ExpressionSpecification =
    mode === "grade"
      ? ([
          "match",
          ["feature-state", "grade"],
          "best", GRADE_COLOR.best,
          "normal", GRADE_COLOR.normal,
          "bad", GRADE_COLOR.bad,
          OUT_OF_RANGE_COLOR,
        ] as maplibregl.ExpressionSpecification)
      : ([
          "match",
          ["feature-state", "band"],
          ...COMMUTE_BANDS.flatMap((b, i) => [i, b.color]),
          OUT_OF_RANGE_COLOR,
        ] as unknown as maplibregl.ExpressionSpecification);

  return [
    "case",
    ["boolean", ["feature-state", "reachable"], false],
    inner,
    OUT_OF_RANGE_COLOR,
  ] as maplibregl.ExpressionSpecification;
}

function pointsFrom(dongs: DongMeta[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: dongs.map((d) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: markerCoord(d) },
      properties: { code: d.code, dong: d.dong, gu: d.gu },
    })),
  };
}

/** 마커(등급 아이콘) 좌표. markerLng/markerLat가 있으면 그걸, 없으면 lng/lat로 폴백한다. */
function markerCoord(d: DongMeta): [number, number] {
  return [d.markerLng ?? d.lng, d.markerLat ?? d.lat];
}

const emptyFC = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

/**
 * 툴팁. 지도를 훑기만 해도 "왜 이 등급인지"가 보이도록 한 줄 이유를 붙인다.
 * 다만 세 줄을 넘기면 지도를 가려서 방해가 되므로 이유는 잘라 쓴다.
 */
function tooltipHtml(name: string, view: DongView | undefined, hasDestination: boolean): string {
  const esc = escapeHtml;

  if (!hasDestination) {
    return `<b>${esc(name)}</b><br><span style="color:#9aa1ae">먼저 목적지를 정해주세요</span>`;
  }
  if (!view || !view.reachable) {
    const why = view?.overBudget ? "예산 초과" : "통근 가능 시간 밖";
    return `<b>${esc(name)}</b><br><span style="color:#9aa1ae">${why}</span>`;
  }
  const min = view.worstMin;
  const lines = [
    `<b>${esc(name)}</b> <span style="color:${GRADE_COLOR[view.grade]}">● ${GRADE_LABEL[view.grade]}</span>`,
  ];
  if (min !== null) {
    lines.push(
      `<span style="color:#9aa1ae">통근 약 ${Math.round(min)}분 · ${esc(view.commute.viaStation ?? "")}역</span>`
    );
  }
  if (view.reason) {
    lines.push(`<span style="color:#c7cbd4">${esc(trim(view.reason, 46))}</span>`);
  }
  return lines.join("<br>");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

function trim(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).replace(/[\s,]+$/, "") + "…";
}
