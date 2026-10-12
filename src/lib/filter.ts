import type { CropResult, Filters, LatLng, Parcel, ParcelView } from '../types';
import { AREA_MAX } from '../data/constants';
import { pointInPolygon } from './geometry';

/** Filtres « données » (tout sauf la sélection de cultures). Équivalent client des paramètres de GET /api/parcelles. */
export function baseFilter(parcels: Parcel[], f: Filters, zone: LatLng[] | null): ParcelView[] {
  const out: ParcelView[] = [];
  for (const p of parcels) {
    if (p.rejected) continue;
    if (f.regionId && p.regionId !== f.regionId) continue;
    if (f.communeId && p.communeId !== f.communeId) continue;
    const r = p.results[f.seasonId];
    if (!r) continue;
    if (f.dateFrom && r.processedAt.slice(0, 10) < f.dateFrom) continue;
    if (f.dateTo && r.processedAt.slice(0, 10) > f.dateTo) continue;
    if (p.areaHa < f.areaMin) continue;
    if (f.areaMax < AREA_MAX && p.areaHa > f.areaMax) continue;
    if (r.confidence * 100 < f.confMin) continue;
    if (f.statuses.length && !f.statuses.includes(r.status)) continue;
    if (zone && !pointInPolygon(p.centroid, zone)) continue;
    out.push({ p, r });
  }
  return out;
}

export function cultureFilter(views: ParcelView[], f: Filters): ParcelView[] {
  if (f.mode === 'general' || f.cultures.length === 0) return views;
  const set = new Set(f.cultures);
  return views.filter((v) => set.has(v.r.culture));
}

export const isUncertain = (r: CropResult, threshold: number) =>
  r.status === 'incertain' || r.confidence < threshold;

export interface Aggregate {
  count: number; area: number; validated: number; uncertain: number; uncertainArea: number;
  byCulture: Record<string, { count: number; area: number }>;
}

export function aggregate(views: ParcelView[], threshold: number): Aggregate {
  const agg: Aggregate = { count: 0, area: 0, validated: 0, uncertain: 0, uncertainArea: 0, byCulture: {} };
  for (const { p, r } of views) {
    agg.count += 1;
    agg.area += p.areaHa;
    if (r.status === 'verifie_terrain' || r.status === 'corrige') agg.validated += 1;
    if (isUncertain(r, threshold) || r.culture === 'inconnue') { agg.uncertain += 1; agg.uncertainArea += p.areaHa; }
    const b = (agg.byCulture[r.culture] ??= { count: 0, area: 0 });
    b.count += 1;
    b.area += p.areaHa;
  }
  return agg;
}

/** Nombre de filtres actifs (hors saison) — pour le badge du bouton « Filtres ». */
export function activeFilterCount(f: Filters, zone: LatLng[] | null): number {
  return [
    !!f.regionId, !!f.communeId, f.areaMin > 0, f.areaMax < AREA_MAX, f.confMin > 0,
    f.statuses.length > 0, !!f.dateFrom, !!f.dateTo, !!zone, f.mode !== 'general' && f.cultures.length > 0,
  ].filter(Boolean).length;
}
