/**
 * Adaptateur Malto → modèle frontend.
 *
 * Malto expose `GET /api/parcelles` : polygones FTW (field boundaries) détectés par
 * segmentation, classés orge / non-orge par un RF Sentinel-2, autour d'Antsirabe :
 *   { id: uuid, label, coordinates: [{lat,lng}], center_lat, center_lng, surface_ha,
 *     culture_declared, culture_detected («Orge» | «Non-orge»), ndvi_percentage,
 *     confidence (0–100, probabilité d'orge), verdict («✅ ORGE CONFIRMÉE — … (xx%)»),
 *     saison («Montaison», stade de croissance), owner_name, notes, created_at, … }
 *
 * Correspondance vers le modèle `Parcel` du frontend (src/types.ts) :
 *   - confidence en % → probabilité 0–1, inversée pour les «Non-orge» ;
 *   - saison = stade de croissance → rattachée à la saison par défaut (2026-C),
 *     le stade est conservé dans modelVersion («Malto FTW · Montaison») ;
 *   - surface_ha = 0 → recalculée depuis la géométrie du polygone ;
 *   - région/commune déduites par point-in-polygon du référentiel local.
 */
import type { CropResult, CultureId, LatLng, Parcel, Status, Region, Commune } from '../types';
import { pointInPolygon, ringAreaHa } from '../lib/geometry';
import { request } from './http';
import { DEFAULT_SEASON, SEASON_BY_ID, CURRENT_MODEL } from '../data/constants';

/** Feature GeoJSON renvoyée par `GET /api/zone-parcels` (tracé VHR Delineate Anything). */
export interface MaltoVhrFeature {
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties: {
    parcel_id?: string;
    confidence?: number;      // % (0–100)
    area_ha?: number;
    distance_m?: number;
    source?: string;          // ex. « JECAM-VHR »
    trace_mode?: string;
    [k: string]: unknown;
  };
}

/** Parcelle brute renvoyée par Malto (champs utilisés uniquement). */
export interface MaltoParcel {
  id: string;
  label?: string | null;
  coordinates?: { lat: number; lng: number }[] | null;
  center_lat?: number | null;
  center_lng?: number | null;
  surface_ha?: number | null;
  culture_declared?: string | null;
  culture_detected?: string | null;
  ndvi_percentage?: number | null;
  confidence?: number | null;
  verdict?: string | null;
  saison?: string | null;
  created_at?: string | null;
  notes?: string | null;
  owner_name?: string | null;
  [k: string]: unknown;
}

/** Zones du référentiel (régions + communes) pour déduire l'appartenance. */
export interface MaltoZoneInfo {
  regions: Region[];
  communes: Commune[];
}

/** Correspondance libellés Malto (fr/en) → CultureId frontend. */
const CULTURE_MAP: Record<string, CultureId> = {
  'orge': 'orge', 'barley': 'orge',
  'riz': 'riz', 'rice': 'riz', 'paddy': 'riz',
  'haricot': 'haricot', 'bean': 'haricot', 'haricots': 'haricot',
  'maïs': 'mais', 'mais': 'mais', 'corn': 'mais', 'maize': 'mais',
  'manioc': 'manioc', 'cassava': 'manioc',
  'pomme de terre': 'pomme_de_terre', 'potato': 'pomme_de_terre', 'pdt': 'pomme_de_terre',
  'jachère': 'jachere', 'jachere': 'jachere', 'fallow': 'jachere',
  'sol nu': 'sol_nu', 'bare': 'sol_nu', 'bare soil': 'sol_nu',
  'végétation': 'vegetation', 'vegetation': 'vegetation',
  'eau': 'eau', 'water': 'eau',
  'unknown': 'inconnue', 'inconnue': 'inconnue',
};

export function mapCulture(raw: string | null | undefined): CultureId {
  if (!raw) return 'inconnue';
  return CULTURE_MAP[raw.trim().toLowerCase()] ?? 'autre';
}

/** Extrait la probabilité d'orge du verdict Malto, ex. «…probabilité d'orge 54%». */
function orgeProbFromVerdict(verdict: string | null | undefined): number | null {
  if (!verdict) return null;
  const m = verdict.match(/probabilit[ée]\s*d['’]orge\s*(\d+(?:[.,]\d+)?)\s*%/i);
  return m ? Number(m[1].replace(',', '.')) / 100 : null;
}

function isNonOrge(p: MaltoParcel): boolean {
  const raw = (p.culture_detected ?? '').toLowerCase();
  return raw.includes('non-orge') || raw.includes('non orge');
}

/**
 * Confiance du classement ТС, 0-1 :
 *  - culture_detected renseigné → `confidence` Malto est la probabilité d'orge (0–100)
 *    dans le verdict (elle est déjà la certitude du classement, pas besoin d'inverser) ;
 *  - culture_detected absent → pas encore classifiée : culture = inconnue, confiance 0.
 */
function mapConfidence(p: MaltoParcel): number {
  const declared = (p.culture_detected ?? '').trim() !== '';
  if (!declared) return 0.05; // non encore classifiée
  let conf = p.confidence ?? orgeProbFromVerdict(p.verdict);
  if (conf == null) conf = p.ndvi_percentage != null ? p.ndvi_percentage / 100 : 0.5;
  else if (conf > 1) conf /= 100; // % → probabilité
  return Math.min(0.99, Math.max(0.05, conf));
}

/** Statut dérivé : verdict Malto → workflow frontend. */
function mapStatus(p: MaltoParcel, conf: number): Status {
  const v = (p.verdict ?? '').toLowerCase();
  if (v.includes('validé') || v.includes('valide') || v.includes('terrain')) return 'verifie_terrain';
  if (v.includes('corrig')) return 'corrige';
  if (v.includes('obsol')) return 'obsolete';
  if (conf < 0.5) return 'incertain';
  return 'non_verifie';
}

/** Saison : id connu → tel quel ; sinon (ex. stade «Montaison») saison par défaut. */
function mapSeason(raw: string | null | undefined): { id: string; stage: string } {
  const s = raw?.trim() ?? '';
  if (s && SEASON_BY_ID[s]) return { id: s, stage: s };
  return { id: DEFAULT_SEASON, stage: s };
}

/** Traduit un lot de parcelles Malto vers les Parcel du frontend. */
export function maltoToFrontend(parcels: MaltoParcel[], zones?: MaltoZoneInfo): Parcel[] {
  return parcels
    .filter((p) => Array.isArray(p.coordinates) && p.coordinates.length >= 3)
    .map((p) => {
      const coords: LatLng[] = (p.coordinates ?? []).map((c) => [c.lat, c.lng] as LatLng);
      const centroid: LatLng =
        p.center_lat != null && p.center_lng != null
          ? [p.center_lat, p.center_lng]
          : avgPoint(coords);

      const season = mapSeason(p.saison);
      const isBarley = !isNonOrge(p);
      const culture: CultureId =
        !isBarley ? 'autre' // « Non-orge » détecté par le RF → autre culture
        : (p.culture_detected ?? '').trim() !== '' ? 'orge' // classifiée orge
        : mapCulture(p.culture_declared) || 'inconnue'; // non encore classifiée
      const conf = mapConfidence(p);
      const processedAt = p.created_at || new Date().toISOString();

      const result: CropResult = {
        seasonId: season.id,
        culture,
        confidence: conf,
        probs: { [culture]: conf } as Partial<Record<CultureId, number>>,
        status: mapStatus(p, conf),
        analysisId: `MALTO-${p.id.slice(0, 8)}`,
        modelVersion: `Malto FTW${season.stage !== season.id ? ` · ${season.stage}` : ''} (RF ${CURRENT_MODEL.includes('RF') ? CURRENT_MODEL : ''})`.trim(),
        processedAt,
        observedFrom: processedAt.slice(0, 10),
        observedTo: processedAt.slice(0, 10),
      };

      // Région/commune déduites du centroïde via le référentiel fourni.
      let regionId = '';
      let communeId = '';
      if (zones) {
        regionId = zones.regions.find((r) => pointInPolygon(centroid, r.outline))?.id ?? '';
        communeId = zones.communes.find((c) => pointInPolygon(centroid, c.outline))?.id ?? '';
      }

      const areaHa = p.surface_ha && p.surface_ha > 0 ? p.surface_ha : ringAreaHa(coords);

      return {
        id: p.id,
        communeId,
        regionId,
        coords,
        centroid,
        areaHa,
        detectionConfidence: conf,
        createdAt: processedAt,
        results: { [season.id]: result },
        corrections: [],
        rejected: false,
      };
    });
}

/** Moyenne arithmétique des sommets (fallback si center_* absent). */
function avgPoint(coords: LatLng[]): LatLng {
  if (!coords.length) return [0, 0];
  let x = 0;
  let y = 0;
  for (const [a, b] of coords) {
    x += a;
    y += b;
  }
  return [x / coords.length, y / coords.length];
}

/**
 * Convertit les features GeoJSON de `GET /api/zone-parcels` (464 parcelles VHR
 * tracées sur image ~1,2 m autour d'Antsirabe) vers le modèle frontend.
 * Ces parcelles n'ont pas encore de classification de culture → inconnues,
 * statut « incertain » (non classé), confiance = confidence/100 du tracé.
 */
export function maltoVhrToFrontend(
  features: MaltoVhrFeature[],
  zones?: MaltoZoneInfo,
  idPrefix = '',
): Parcel[] {
  return features
    .map((f) => {
      // GeoJSON Polygon: [[[lng,lat],…]] ; MultiPolygon: [[[[lng,lat],…],…]] —
      // on prend le plus grand anneau (celui qui a le plus de sommets).
      let ring: number[][] = [];
      if (f.geometry?.type === 'Polygon') {
        ring = (f.geometry.coordinates as number[][][])[0] ?? [];
      } else if (f.geometry?.type === 'MultiPolygon') {
        const polygons = f.geometry.coordinates as unknown as number[][][][];
        ring = polygons.flat().reduce((best, r) => (r.length > best.length ? r : best), [] as number[][]);
      }
      const coords: LatLng[] = ring.map(([lng, lat]) => [lat, lng] as LatLng);
      if (coords.length < 3) return null;
      const centroid = avgPoint(coords);

      const rawConf = f.properties.confidence != null ? f.properties.confidence : 50;
      const conf = Math.min(0.99, Math.max(0.01, rawConf > 1 ? rawConf / 100 : rawConf));
      const processedAt = new Date().toISOString();

      const result: CropResult = {
        seasonId: DEFAULT_SEASON,
        culture: 'inconnue', // pas de classification de culture sur les tracés VHR
        confidence: conf,
        probs: { inconnue: conf } as Partial<Record<CultureId, number>>,
        status: 'incertain', // équiv. « non classé » (contours pointillés, REC-09)
        analysisId: 'MALTO-VHR',
        modelVersion: `Delineate Anything${f.properties.source ? ` · ${f.properties.source}` : ''}`,
        processedAt,
        observedFrom: processedAt.slice(0, 10),
        observedTo: processedAt.slice(0, 10),
      };

      let regionId = '';
      let communeId = '';
      if (zones) {
        regionId = zones.regions.find((r) => pointInPolygon(centroid, r.outline))?.id ?? '';
        communeId = zones.communes.find((c) => pointInPolygon(centroid, c.outline))?.id ?? '';
      }

      const p: Parcel = {
        // Le modèle redémarre sa numérotation (VHR-0001, …) à chaque requête.
        // Préfixer avec la tuile empêche le store de confondre deux parcelles distinctes.
        id: f.properties.parcel_id
          ? `${idPrefix ? `${idPrefix}-` : ''}${f.properties.parcel_id}`
          : `${idPrefix ? `${idPrefix}-` : 'VHR-'}${Math.random().toString(36).slice(2, 10)}`,
        communeId,
        regionId,
        coords,
        centroid,
        areaHa: f.properties.area_ha ?? ringAreaHa(coords),
        detectionConfidence: conf,
        createdAt: processedAt,
        results: { [DEFAULT_SEASON]: result },
        corrections: [],
        rejected: false,
      };
      return p;
    })
    .filter((p) => p !== null);
}

/** Charge les parcelles VHR autour d'un point (route /api/zone-parcels de Malto). */
export async function fetchMaltoVhrParcels(
  lat: number, lon: number, radiusDeg: number, zones?: MaltoZoneInfo,
): Promise<Parcel[]> {
  const radiusM = Math.min(1000, Math.round(radiusDeg * 111_000)); // plafonné à 1 km (limite du service de tracage)
  const body = await request<{ geojson?: { features?: MaltoVhrFeature[] } }>(
    `/api/zone-parcels?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&radius_m=${radiusM}`,
    {},
    300_000, // tracé VHR possible : plusieurs minutes si la zone n'est pas précalculée
  );
  return maltoVhrToFrontend(body.geojson?.features ?? [], zones);
}
