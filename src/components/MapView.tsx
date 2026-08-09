import { useEffect, useRef } from "react";
import maplibregl, { type MapGeoJSONFeature } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { CommuteResult, DongMeta, Destination, Grade } from "../types";
import { GRADE_COLOR, GRADE_LABEL, OUT_OF_RANGE_COLOR } from "../lib/constants";
import { LINE_COLOR, lineName, type SubwayLayers } from "../lib/subwayLines";

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
  /** 첫 번째 목적지 기준 상세 (툴팁의 "○○역 경유" 표기용) */
  commute: CommuteResult;
  /** 모든 목적지 중 가장 오래 걸리는 시간 — 통근권 판정과 툴팁 숫자에 쓴다 */
  worstMin: number | null;
  reachable: boolean;
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
  /** 선택된 동의 통근 경로 (역 좌표를 이은 선) */
  routePath: Array<Array<[number, number]>>;
  /** 지하철 노선도 (노선별 MultiLineString + 역 Point) */
  subway: SubwayLayers;
  showSubway: boolean;
  /**
   * 표시할 노선. null 이면 전부 표시한다.
   * (범례에 없는 비주요 노선까지 일일이 상태로 들고 있지 않기 위한 구분)
   */
  visibleLines: string[] | null;
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
  onPickStation,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // 최신 props를 이벤트 핸들러에서 읽기 위한 ref (핸들러를 재등록하지 않기 위함)
  const stateRef = useRef({ dongs, views, onSelect, onPickStation });
  stateRef.current = { dongs, views, onSelect, onPickStation };

  // 지하철 노선도는 불변이므로 지도 생성 시점에 한 번만 읽는다
  const subwayRef = useRef(subway);
  subwayRef.current = subway;

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
          "circle-color": ["get", "color"],
          // 등급 아이콘(3.5~9)보다 확실히 작아야 둘이 구분된다
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, ["case", ["get", "isTransfer"], 2.4, 1.8],
            13, ["case", ["get", "isTransfer"], 4, 2.8],
            16, ["case", ["get", "isTransfer"], 6, 4.5],
          ],
          "circle-stroke-color": "#12141a",
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

      /*
       * 통근 경로.
       *
       * 역 좌표를 직선으로 이은 것이지 실제 선로 모양이 아니다. 실선으로 그리면
       * 실제 노선처럼 보여 정확도를 오해하므로 점선으로 그리고, 사이드바에도
       * 추정치임을 적어둔다.
       */
      map.addLayer({
        id: "route-line",
        type: "line",
        source: SRC_ROUTE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#7fb0ff",
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
          "text-color": "#b9c0cc",
          "text-halo-color": "#12141a",
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
  }, [destinations]);

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
  }, [showSubway]);

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
  }, [visibleLines]);

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
          .filter((coords) => coords.length >= 2)
          .map((coords) => ({
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: {},
          })),
      });
    };

    if (readyRef.current) apply();
    else map.once("oneday.ready", apply);
  }, [routePath]);

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

/**
 * 툴팁. 지도를 훑기만 해도 "왜 이 등급인지"가 보이도록 한 줄 이유를 붙인다.
 * 다만 세 줄을 넘기면 지도를 가려서 방해가 되므로 이유는 잘라 쓴다.
 */
function tooltipHtml(name: string, view: DongView | undefined): string {
  const esc = escapeHtml;

  if (!view || !view.reachable) {
    return `<b>${esc(name)}</b><br><span style="color:#9aa1ae">통근 가능 시간 밖</span>`;
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
