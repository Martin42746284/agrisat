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

/**
 * Identifie si deux parcelles désignent le même champ agricole :
 * - même identifiant,
 * - ou le centroïde de l'une tombe dans le contour de l'autre (recouvrement géométrique),
 * - ou centroïdes très proches avec chevauchement des boîtes englobantes et surfaces compatibles.
 *
 * Évite les doublons entre le traçage VHR automatique et les parcelles déjà enregistrées en base,
 * ainsi qu'entre tuiles adjacentes lors des déplacements sur la carte.
 */
export function isDuplicateVhrParcel(
  a: { id: string; coords: LatLng[]; centroid: LatLng; areaHa: number; results?: Record<string, { modelVersion?: string }> },
  b: { id: string; coords: LatLng[]; centroid: LatLng; areaHa: number; results?: Record<string, { modelVersion?: string }> },
): boolean {
  if (a.id === b.id) return true;
  if (!a.coords?.length || !b.coords?.length || a.areaHa <= 0 || b.areaHa <= 0) return false;

  const areaA = a.areaHa * 10_000;
  const areaB = b.areaHa * 10_000;
  const minArea = Math.min(areaA, areaB);
  const maxArea = Math.max(areaA, areaB);
  const areaRatio = minArea / maxArea;

  // 1) Test préliminaire de boîte englobante avec marge de sécurité (~25 mètres)
  const degMargin = 25 / M_PER_DEG_LAT;
  const [[minLaA, minLoA], [maxLaA, maxLoA]] = bboxOf(a.coords);
  const [[minLaB, minLoB], [maxLaB, maxLoB]] = bboxOf(b.coords);
  if (
    minLaA > maxLaB + degMargin ||
    maxLaA < minLaB - degMargin ||
    minLoA > maxLoB + degMargin ||
    maxLoA < minLoB - degMargin
  ) {
    return false;
  }

  // 2) Critère spatial majeur : le centre de l'un est contenu dans le polygone de l'autre
  // Gère parfaitement les décalages de contour entre Sentinel-2 (BDD) et VHR (traçage auto).
  if (areaRatio >= 0.25) {
    if (pointInPolygon(a.centroid, b.coords) || pointInPolygon(b.centroid, a.coords)) {
      return true;
    }
  }

  // 3) Proximité des centroïdes et ratio de surface pour les parcelles concaves ou allongées
  const latitude = (a.centroid[0] + b.centroid[0]) / 2;
  const east = (a.centroid[1] - b.centroid[1]) * mPerDegLng(latitude);
  const north = (a.centroid[0] - b.centroid[0]) * M_PER_DEG_LAT;
  const centerDistM = Math.hypot(north, east);

  // Tolérance adaptative à la racine de la surface (entre 18 m et 45 m)
  const centerToleranceM = Math.max(18, Math.min(45, Math.sqrt(maxArea) * 0.22));
  if (areaRatio >= 0.4 && centerDistM <= centerToleranceM) {
    return true;
  }

  return false;
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
