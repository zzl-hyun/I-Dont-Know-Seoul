/** 파이프라인 스크립트용 지오 헬퍼. src/lib/geo.ts 와 동일한 공식을 쓴다. */

const EARTH_R = 6371008.8; // m
const toRad = (d) => (d * Math.PI) / 180;

/** 두 좌표 사이 대권거리 (m) */
export function haversineM(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

/**
 * 점이 폴리곤 내부인지 (ray casting).
 * ring: [[lng,lat], ...] — GeoJSON 좌표 순서
 */
export function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** GeoJSON Polygon / MultiPolygon 내부 판정 (구멍 처리 포함) */
export function pointInGeometry(lng, lat, geometry) {
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    if (!pointInRing(lng, lat, poly[0])) continue;
    // 첫 링이 외곽, 나머지는 구멍
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(lng, lat, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/** GeoJSON geometry 의 바운딩 박스 [minLng, minLat, maxLng, maxLat] */
export function bbox(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}
