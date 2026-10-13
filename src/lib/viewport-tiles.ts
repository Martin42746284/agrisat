import type { MaltoVhrFeature } from '../api/maltoAdapter';

const TILE_SIZE_M = 1_200;
export const TILE_RADIUS_M = 1_000;
export const MIN_TRACING_ZOOM = 15;
const MAX_TILES_PER_VIEW = 24;

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG_EQUATOR = 111_320;
const LAT_STEP = TILE_SIZE_M / M_PER_DEG_LAT;

export interface MapBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface TraceTile extends MapBounds {
  key: string;
  center: { lat: number; lng: number };
}

function longitudeScale(lat: number): number {
  return Math.max(Math.abs(Math.cos((lat * Math.PI) / 180)), 0.1);
}

function lngStep(row: number): number {
  const rowCenterLat = (row + 0.5) * LAT_STEP;
  return TILE_SIZE_M / (M_PER_DEG_LNG_EQUATOR * longitudeScale(rowCenterLat));
}

function tileAt(row: number, col: number): TraceTile {
  const step = lngStep(row);
  const south = row * LAT_STEP;
  const west = col * step;
  return {
    key: `${row}:${col}`,
    south,
    north: south + LAT_STEP,
    west,
    east: west + step,
    center: { lat: south + LAT_STEP / 2, lng: west + step / 2 },
  };
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const east = (b.lng - a.lng) * M_PER_DEG_LNG_EQUATOR * longitudeScale(a.lat);
  const north = (b.lat - a.lat) * M_PER_DEG_LAT;
  return Math.hypot(east, north);
}

/** Tuiles fixes qui recoupent l'écran, triées du centre vers l'extérieur. */
export function tilesForBounds(bounds: MapBounds, viewCenter: { lat: number; lng: number }): TraceTile[] {
  const tiles: TraceTile[] = [];
  const firstRow = Math.floor(bounds.south / LAT_STEP);
  const lastRow = Math.floor(bounds.north / LAT_STEP);
  for (let row = firstRow; row <= lastRow; row += 1) {
    const step = lngStep(row);
    const lastCol = Math.floor(bounds.east / step);
    for (let col = Math.floor(bounds.west / step); col <= lastCol; col += 1) {
      tiles.push(tileAt(row, col));
    }
  }
  return tiles
    .sort((a, b) => distanceM(viewCenter, a.center) - distanceM(viewCenter, b.center))
    .slice(0, MAX_TILES_PER_VIEW);
}

function outerRing(feature: MaltoVhrFeature): number[][] | null {
  if (feature.geometry.type === 'Polygon') {
    return (feature.geometry.coordinates as number[][][])[0] ?? null;
  }
  if (feature.geometry.type === 'MultiPolygon') {
    return (feature.geometry.coordinates as number[][][][])[0]?.[0] ?? null;
  }
  return null;
}

function featureCenter(feature: MaltoVhrFeature): { lat: number; lng: number } | null {
  const ring = outerRing(feature);
  if (!ring?.length) return null;
  return {
    lat: ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length,
    lng: ring.reduce((sum, [lng]) => sum + lng, 0) / ring.length,
  };
}

/** Garde chaque parcelle dans la seule tuile contenant son centre. */
export function featuresInTile(features: MaltoVhrFeature[], tile: MapBounds): MaltoVhrFeature[] {
  return features.filter((feature) => {
    const center = featureCenter(feature);
    return center !== null
      && center.lat >= tile.south && center.lat < tile.north
      && center.lng >= tile.west && center.lng < tile.east;
  });
}
