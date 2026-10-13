/**
 * Bootstrap 100 % Malto — aucune donnée fictive dans les parcelles, régions, communes.
 *
 * Sources réelles (backend Malto, base Neon Postgres) :
 *   GET /api/parcelles      → parcelles FTW classifiées orge / non-orge (RF Sentinel-2)
 *   GET /api/zone-parcels   → tracés VHR (Delineate Anything) autour d'Antsirabe
 *
 * Régions et communes sont reconstruites À PARTIR DES PARCELLES réelles (enveloppe
 * convexe des centroïdes), plus aucune géométrie fictive. Les utilisateurs, analyses
 * et journal d'audit démarrent vides : Malto n'expose pas (encore) de routes pour eux.
 */
import type { Analysis, AuditEntry, Commune, LatLng, Parcel, Region, User } from '../types';
import { request } from './http';
import { maltoConfigured } from './services';
import { maltoToFrontend, maltoVhrToFrontend, type MaltoParcel, type MaltoVhrFeature } from './maltoAdapter';
import { convexHull, scaleAround, centroidOf } from '../lib/geometry';

/** Réponse du bootstrap : données 100 % réelles, comptes/analyses vides. */
export interface BootstrapDb {
  regions: Region[];
  communes: Commune[];
  parcels: Parcel[];
  analyses: Analysis[];
  users: User[];
  audit: AuditEntry[];
}

/** Centroïde de repli de la zone Malto (autour d'Antsirabe, Vakinankaratra). */
const VHR_CENTER: LatLng = [-19.86, 47.02];
const VHR_RADIUS_M = 800;

/**
 * Construit une « commune » unique (et sa région) à partir des parcelles réelles :
 * enveloppe convexe de tous les centroïdes. Si Malto expose un jour plusieurs
 * régions, on regroupera ici par région réelle.
 */
function deriveZones(parcels: Parcel[]): { regions: Region[]; communes: Commune[] } {
  const centroids = parcels.filter((p) => !p.rejected).map((p) => p.centroid);
  if (!centroids.length) return { regions: [], communes: [] };

  const hull = convexHull(centroids);
  const ctr = centroidOf(hull);
  const region: Region = {
    id: 'malto-zone',
    name: 'Zone Malto (Vakinankaratra)',
    center: ctr,
    outline: scaleAround(hull, ctr, 1.12),
  };
  const commune: Commune = {
    id: 'malto-antsirabe',
    regionId: region.id,
    name: 'Antsirabe — données Malto',
    code: 'MALTO',
    center: ctr,
    outline: scaleAround(hull, ctr, 1.06),
    coverage: 'analysee',
    imageDate: null,
    cloudCover: 0,
  };
  return { regions: [region], communes: [commune] };
}

/** Assigne chaque parcelle à la commune/région dérivée (tout est dedans par construction). */
function assignZones(parcels: Parcel[], regions: Region[], communes: Commune[]): Parcel[] {
  return parcels.map((p) => ({
    ...p,
    regionId: regions[0]?.id ?? '',
    communeId: communes[0]?.id ?? '',
  }));
}

/** Bootstrap réel : parcelles Malto + zones dérivées des parcelles + comptes vides. */
export async function bootstrapReal(): Promise<BootstrapDb> {
  if (!maltoConfigured()) {
    console.warn('[AgriSat] VITE_MALTO_API_URL non défini — aucune donnée affichée (backend non configuré).');
    return { regions: [], communes: [], parcels: [], analyses: [], users: [], audit: [] };
  }

  // 1) Parcelles FTW classifiées (orge / non-orge).
  const ftw = maltoToFrontend(await request<MaltoParcel[]>('/api/parcelles'));

  // 2) Tracés VHR autour du centroïde réel de la zone classifiée.
  let vhr: Parcel[] = [];
  try {
    const [lat, lng] = ftw.length ? ftw[0].centroid : VHR_CENTER;
    const zp = await request<{ geojson?: { features?: MaltoVhrFeature[] } }>(
      `/api/zone-parcels?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&radius_m=${VHR_RADIUS_M}`,
      {},
      30_000,
    );
    vhr = maltoVhrToFrontend(zp.geojson?.features ?? []);
  } catch (err) {
    console.warn('[AgriSat] /api/zone-parcels indisponible, tracés VHR ignorés :', err);
  }

  // 3) Déduplication puis zones (région + commune) dérivées des parcelles réelles.
  const seen = new Set(ftw.map((p) => p.id));
  const all = [...ftw, ...vhr.filter((p) => !seen.has(p.id))];
  const zones = deriveZones(all);
  const parcels = assignZones(all, zones.regions, zones.communes);

  console.info(`[AgriSat] Données réelles : ${parcels.length} parcelles, ${zones.regions.length} région(s), ${zones.communes.length} commune(s).`);

  return {
    regions: zones.regions,
    communes: zones.communes,
    parcels,
    analyses: [],
    users: [],
    audit: [],
  };
}
