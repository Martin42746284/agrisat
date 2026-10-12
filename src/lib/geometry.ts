import type { LatLng } from '../types';

export const M_PER_DEG_LAT = 110574;
export const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

/** Superficie (ha) d'un anneau [lat,lng] — projection équirectangulaire locale. */
export function ringAreaHa(coords: LatLng[]): number {
  const n = coords.length;
  if (n < 3) return 0;
  const [la0, lo0] = coords[0];
  const kx = mPerDegLng(la0);
  const pts = coords.map(([la, lo]) => [(lo - lo0) * kx, (la - la0) * M_PER_DEG_LAT]);
  let a = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2 / 10000;
}

export function centroidOf(coords: LatLng[]): LatLng {
  const n = coords.length;
  return [coords.reduce((s, c) => s + c[0], 0) / n, coords.reduce((s, c) => s + c[1], 0) / n];
}

export function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
  const [y, x] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bboxOf(coords: LatLng[]): [LatLng, LatLng] {
  let minLa = Infinity, minLo = Infinity, maxLa = -Infinity, maxLo = -Infinity;
  for (const [la, lo] of coords) {
    if (la < minLa) minLa = la;
    if (la > maxLa) maxLa = la;
    if (lo < minLo) minLo = lo;
    if (lo > maxLo) maxLo = lo;
  }
  return [[minLa, minLo], [maxLa, maxLo]];
}

/** Enveloppe convexe (monotone chain) sur des points [lat,lng]. */
export function convexHull(points: LatLng[]): LatLng[] {
  const p = points.map(([la, lo]) => [lo, la] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper].map(([lo, la]) => [la, lo] as LatLng);
}

export function scaleAround(poly: LatLng[], center: LatLng, k: number): LatLng[] {
  return poly.map(([la, lo]) => [center[0] + (la - center[0]) * k, center[1] + (lo - center[1]) * k] as LatLng);
}
