/**
 * scripts/lib/geo.mjs 의 타입 선언.
 *
 * 파이프라인 스크립트는 순수 JS 라 타입이 없지만, `commute.test.ts` 가
 * "앱과 파이프라인의 도보 상수가 같은지"를 검사하려고 이 모듈을 불러온다.
 * 그 import 하나 때문에 필요한 선언이다.
 */
export declare const WALK_SPEED_M_PER_MIN: number;
export declare const WALK_DETOUR_FACTOR: number;
export declare function walkMinutes(straightM: number): number;
export declare function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number;
export declare function pointInRing(lng: number, lat: number, ring: Array<[number, number]>): boolean;
export declare function pointInGeometry(lng: number, lat: number, geometry: unknown): boolean;
export declare function bbox(geometry: unknown): [number, number, number, number];
