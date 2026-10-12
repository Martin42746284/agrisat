/**
 * Génération déterministe de DONNÉES FICTIVES.
 * Aucune de ces parcelles ne correspond à une réalité de terrain.
 */
import type {
  Analysis, AuditEntry, Commune, Coverage, CropResult, CultureId, LatLng, LogLine,
  Parcel, Region, Status, User,
} from '../types';
import { mulberry32 } from '../lib/rng';
import { M_PER_DEG_LAT, centroidOf, convexHull, mPerDegLng, ringAreaHa, scaleAround } from '../lib/geometry';
import { CURRENT_MODEL, PIPELINE_STEPS, SEASONS } from './constants';

const rng = mulberry32(20261010);
const rnd = (a = 0, b = 1) => a + (b - a) * rng();
const rint = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function wpick<T extends string>(w: Partial<Record<T, number>>): T {
  const entries = Object.entries(w) as [T, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let r = rng() * total;
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

type Mix = Partial<Record<CultureId, number>>;
interface CommuneDef { id: string; name: string; code: string; center: LatLng; radius: number; coverage: Coverage; cloud: number; clusters: number }
interface RegionDef { id: string; name: string; mix: Mix; communes: CommuneDef[] }

const REGION_DEFS: RegionDef[] = [
  {
    id: 'vakinankaratra', name: 'Vakinankaratra',
    mix: { orge: 0.22, pomme_de_terre: 0.14, haricot: 0.14, mais: 0.14, riz: 0.16, manioc: 0.03, jachere: 0.07, vegetation: 0.05, sol_nu: 0.03, autre: 0.02 },
    communes: [
      { id: 'antsirabe', name: 'Antsirabe', code: 'ATB', center: [-19.866, 47.033], radius: 0.09, coverage: 'analysee', cloud: 0.12, clusters: 5 },
      { id: 'betafo', name: 'Betafo', code: 'BTF', center: [-19.838, 46.846], radius: 0.1, coverage: 'analysee', cloud: 0.16, clusters: 4 },
      { id: 'faratsiho', name: 'Faratsiho', code: 'FRT', center: [-19.383, 46.95], radius: 0.1, coverage: 'analysee', cloud: 0.22, clusters: 4 },
      { id: 'antanifotsy', name: 'Antanifotsy', code: 'ATF', center: [-19.65, 47.317], radius: 0.09, coverage: 'analysee', cloud: 0.14, clusters: 4 },
      { id: 'ambatolampy', name: 'Ambatolampy', code: 'ABL', center: [-19.383, 47.417], radius: 0.09, coverage: 'analysee', cloud: 0.2, clusters: 4 },
    ],
  },
  {
    id: 'itasy', name: 'Itasy',
    mix: { riz: 0.3, mais: 0.2, manioc: 0.12, haricot: 0.12, pomme_de_terre: 0.04, orge: 0.04, jachere: 0.08, vegetation: 0.05, sol_nu: 0.03, eau: 0.02 },
    communes: [
      { id: 'arivonimamo', name: 'Arivonimamo', code: 'ARV', center: [-19.017, 47.183], radius: 0.09, coverage: 'analysee', cloud: 0.18, clusters: 4 },
      { id: 'miarinarivo', name: 'Miarinarivo', code: 'MRN', center: [-18.958, 46.917], radius: 0.09, coverage: 'analysee', cloud: 0.2, clusters: 4 },
      { id: 'soavinandriana', name: 'Soavinandriana', code: 'SVN', center: [-19.167, 46.733], radius: 0.09, coverage: 'analysee', cloud: 0.25, clusters: 3 },
    ],
  },
  {
    id: 'amoron_i_mania', name: "Amoron'i Mania",
    mix: { riz: 0.3, haricot: 0.15, mais: 0.12, pomme_de_terre: 0.1, orge: 0.08, manioc: 0.06, jachere: 0.08, vegetation: 0.07, sol_nu: 0.02, autre: 0.02 },
    communes: [
      { id: 'ambositra', name: 'Ambositra', code: 'AMB', center: [-20.531, 47.245], radius: 0.09, coverage: 'analysee', cloud: 0.18, clusters: 4 },
      { id: 'fandriana', name: 'Fandriana', code: 'FND', center: [-20.233, 47.383], radius: 0.09, coverage: 'analysee', cloud: 0.22, clusters: 4 },
    ],
  },
  {
    id: 'alaotra_mangoro', name: 'Alaotra-Mangoro',
    mix: { riz: 0.55, manioc: 0.1, mais: 0.08, haricot: 0.04, eau: 0.06, jachere: 0.07, vegetation: 0.06, sol_nu: 0.03, orge: 0.01 },
    communes: [
      { id: 'ambatondrazaka', name: 'Ambatondrazaka', code: 'AMZ', center: [-17.833, 48.417], radius: 0.1, coverage: 'analysee', cloud: 0.3, clusters: 5 },
      { id: 'amparafaravola', name: 'Amparafaravola', code: 'APF', center: [-17.617, 48.2], radius: 0.09, coverage: 'analysee', cloud: 0.32, clusters: 4 },
      { id: 'moramanga', name: 'Moramanga', code: 'MRM', center: [-18.95, 48.233], radius: 0.09, coverage: 'partielle', cloud: 0.62, clusters: 2 },
    ],
  },
  {
    id: 'analamanga', name: 'Analamanga',
    mix: { riz: 0.25, mais: 0.15, manioc: 0.15, haricot: 0.12, pomme_de_terre: 0.05, orge: 0.03, jachere: 0.1, vegetation: 0.08, sol_nu: 0.04, autre: 0.03 },
    communes: [
      { id: 'ankazobe', name: 'Ankazobe', code: 'ANK', center: [-18.317, 47.117], radius: 0.09, coverage: 'analysee', cloud: 0.2, clusters: 4 },
      { id: 'manjakandriana', name: 'Manjakandriana', code: 'MJK', center: [-18.917, 47.8], radius: 0.09, coverage: 'analysee', cloud: 0.26, clusters: 3 },
      { id: 'anjozorobe', name: 'Anjozorobe', code: 'ANJ', center: [-18.4, 47.867], radius: 0.09, coverage: 'non_analysee', cloud: 0.5, clusters: 0 },
    ],
  },
];

const SEASON_BIAS: Record<'P' | 'C', Mix> = {
  P: { riz: 1.3, mais: 1.3, manioc: 1.2, orge: 0.15, pomme_de_terre: 0.8, haricot: 1 },
  C: { riz: 0.4, mais: 0.5, manioc: 1, orge: 3.2, pomme_de_terre: 1.4, haricot: 1.3, jachere: 2, sol_nu: 1.6 },
};
const BASE_CONF: Record<CultureId, number> = {
  orge: 0.78, riz: 0.88, haricot: 0.68, mais: 0.76, manioc: 0.7, pomme_de_terre: 0.72,
  autre: 0.55, jachere: 0.7, sol_nu: 0.8, vegetation: 0.85, eau: 0.95, inconnue: 0.35,
};
const CONFUSION: Record<CultureId, CultureId[]> = {
  orge: ['mais', 'jachere', 'haricot', 'riz'], riz: ['eau', 'mais', 'vegetation'],
  haricot: ['mais', 'orge', 'manioc'], mais: ['haricot', 'manioc', 'orge'],
  manioc: ['mais', 'vegetation', 'jachere'], pomme_de_terre: ['haricot', 'mais', 'autre'],
  jachere: ['sol_nu', 'vegetation', 'orge'], sol_nu: ['jachere', 'autre'], vegetation: ['manioc', 'jachere'],
  eau: ['riz'], autre: ['mais', 'haricot', 'jachere'], inconnue: ['autre', 'jachere', 'sol_nu'],
};

function mixFor(mix: Mix, type: 'P' | 'C'): Mix {
  const out: Mix = {};
  for (const [k, v] of Object.entries(mix) as [CultureId, number][]) out[k] = v * (SEASON_BIAS[type][k] ?? 1);
  return out;
}

function blob(center: LatLng, radiusDeg: number, n = 14): LatLng[] {
  const pts: LatLng[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radiusDeg * (0.85 + 0.3 * rng());
    pts.push([center[0] + r * Math.sin(a), center[1] + (r * Math.cos(a)) / Math.cos((center[0] * Math.PI) / 180)]);
  }
  return pts;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoDay(new Date(new Date(iso).getTime() + n * 86400000));

export const USERS: User[] = [
  { id: 'u1', name: 'Hery Rakotoarison', email: 'hery.rakotoarison@exemple.mg', role: 'admin', active: true, lastLogin: '2026-10-09T08:12:00Z' },
  { id: 'u2', name: 'Voahangy Andrianaivo', email: 'voahangy.andrianaivo@exemple.mg', role: 'analyste', active: true, lastLogin: '2026-10-10T06:40:00Z' },
  { id: 'u3', name: 'Tahina Rabe', email: 'tahina.rabe@exemple.mg', role: 'terrain', active: true, lastLogin: '2026-10-08T14:03:00Z' },
  { id: 'u4', name: 'Mamy Razafindrakoto', email: 'mamy.razafindrakoto@exemple.mg', role: 'lecteur', active: true, lastLogin: '2026-10-05T09:21:00Z' },
  { id: 'u5', name: 'Lalao Ravelomanana', email: 'lalao.ravelomanana@exemple.mg', role: 'gestionnaire', active: true, lastLogin: '2026-10-09T16:55:00Z' },
  { id: 'u6', name: 'Fenosoa Randriamihaja', email: 'fenosoa.randriamihaja@exemple.mg', role: 'analyste', active: true, lastLogin: '2026-10-07T11:10:00Z' },
  { id: 'u7', name: 'Njaka Andriamampianina', email: 'njaka.andriamampianina@exemple.mg', role: 'terrain', active: true, lastLogin: '2026-09-29T07:45:00Z' },
  { id: 'u8', name: 'Soa Rasoanaivo', email: 'soa.rasoanaivo@exemple.mg', role: 'lecteur', active: false, lastLogin: '2026-06-14T10:00:00Z' },
];

export interface FakeDb {
  regions: Region[]; communes: Commune[]; parcels: Parcel[];
  analyses: Analysis[]; users: User[]; audit: AuditEntry[];
}

export function buildDb(): FakeDb {
  const regions: Region[] = [];
  const communes: Commune[] = [];
  const parcels: Parcel[] = [];
  const analyses: Analysis[] = [];
  let anSeq = 0;
  const anKey = new Map<string, string>(); // regionId|seasonId -> analysisId

  // --- Régions, communes, analyses (région × saison)
  for (const rd of REGION_DEFS) {
    const cs: Commune[] = rd.communes.map((c) => ({
      id: c.id, regionId: rd.id, name: c.name, code: c.code, center: c.center,
      outline: blob(c.center, c.radius), coverage: c.coverage,
      imageDate: c.coverage === 'non_analysee' ? null : c.coverage === 'partielle' ? '2026-08-30' : `2026-09-${rint(18, 28)}`,
      cloudCover: c.cloud,
    }));
    communes.push(...cs);
    const all = cs.flatMap((c) => c.outline);
    const hull = convexHull(all);
    const ctr = centroidOf(hull);
    regions.push({ id: rd.id, name: rd.name, center: ctr, outline: scaleAround(hull, ctr, 1.06) });

    for (const s of SEASONS) {
      anSeq += 1;
      const id = `AN-${s.end.slice(0, 4)}-${String(anSeq).padStart(3, '0')}`;
      anKey.set(`${rd.id}|${s.id}`, id);
    }
  }

  // --- Parcelles
  const regionDef = Object.fromEntries(REGION_DEFS.map((r) => [r.id, r]));
  let seq = 0;
  for (const rd of REGION_DEFS) {
    for (const cd of rd.communes) {
      const commune = communes.find((c) => c.id === cd.id)!;
      if (cd.clusters === 0) continue;
      const [lat0, lng0] = cd.center;
      const kx = mPerDegLng(lat0);
      const rM = cd.radius * 111000 * 0.68;

      const centers: [number, number][] = [];
      for (let tries = 0; tries < 80 && centers.length < cd.clusters; tries++) {
        const a = rnd(0, Math.PI * 2), d = rM * Math.sqrt(rng());
        const c: [number, number] = [Math.cos(a) * d, Math.sin(a) * d];
        if (centers.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) > 2300)) centers.push(c);
      }

      for (const [cx, cy] of centers) {
        const kind = rng();
        const [w, h, cols, rows] =
          kind < 0.25 ? [rnd(40, 80), rnd(40, 80), rint(10, 14), rint(9, 12)]
          : kind < 0.5 ? [rnd(160, 280), rnd(140, 240), rint(4, 6), rint(4, 5)]
          : [rnd(80, 170), rnd(70, 150), rint(7, 10), rint(6, 9)];
        const angle = rnd(0, Math.PI);
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const jit = 0.18 * Math.min(w, h);
        const domP = wpick(mixFor(rd.mix, 'P'));
        const domC = wpick(mixFor(rd.mix, 'C'));

        const grid: LatLng[][] = [];
        for (let i = 0; i <= cols; i++) {
          grid[i] = [];
          for (let j = 0; j <= rows; j++) {
            const x = (i - cols / 2) * w + rnd(-jit, jit);
            const y = (j - rows / 2) * h + rnd(-jit, jit);
            const rx = x * ca - y * sa + cx, ry = x * sa + y * ca + cy;
            grid[i][j] = [lat0 + ry / M_PER_DEG_LAT, lng0 + rx / kx];
          }
        }
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            if (rng() < (commune.coverage === 'partielle' ? 0.25 : 0.1)) continue;
            const raw: LatLng[] = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
            const ctr = centroidOf(raw);
            const coords = scaleAround(raw, ctr, 0.93);
            const areaHa = ringAreaHa(coords);
            seq += 1;

            const slot = {
              P: rng() < 0.62 ? domP : wpick(mixFor(rd.mix, 'P')),
              C: rng() < 0.62 ? domC : wpick(mixFor(rd.mix, 'C')),
            };
            const results: Record<string, CropResult> = {};
            const corrections: Parcel['corrections'] = [];

            for (const s of SEASONS) {
              if (commune.coverage === 'partielle' && s.type === 'P' && rng() < 0.4) continue;
              let culture: CultureId = rng() < 0.82 ? slot[s.type] : wpick(mixFor(rd.mix, s.type));
              const cloud = clamp(cd.cloud * (s.type === 'P' ? 1.4 : 0.5), 0, 0.9);
              let conf = BASE_CONF[culture] + gauss() * 0.09 - cloud * 0.5 + (areaHa < 0.3 ? -0.15 : areaHa > 1.5 ? 0.04 : 0);
              conf = clamp(conf, 0.2, 0.99);
              if (conf < 0.45 && culture !== 'eau' && rng() < 0.5) { culture = 'inconnue'; conf = clamp(conf, 0.2, 0.4); }

              const others = [...CONFUSION[culture]].sort(() => rng() - 0.5).slice(0, 3);
              const ws = others.map(() => rnd(0.2, 1));
              const sw = ws.reduce((a, b) => a + b, 0);
              const probs: Partial<Record<CultureId, number>> = { [culture]: conf };
              others.forEach((o, k) => { probs[o] = ((1 - conf) * ws[k]) / sw; });

              const outdated = s.modelVersion !== CURRENT_MODEL;
              let status: Status;
              if (outdated && rng() < 0.4) status = 'obsolete';
              else if (conf < 0.5 || culture === 'inconnue') status = 'incertain';
              else if (rng() < 0.07) status = 'verifie_terrain';
              else if (rng() < 0.03) status = 'corrige';
              else status = 'non_verifie';

              const cappedEnd = s.id === '2026-C' ? '2026-10-04' : s.end;
              const obsFrom = addDays(s.start, rint(4, 18));
              const obsTo = addDays(cappedEnd, -rint(3, 20));
              const processed = s.id === '2026-C' ? '2026-10-08T05:30:00Z' : `${addDays(s.end, rint(6, 25))}T09:00:00Z`;
              results[s.id] = {
                seasonId: s.id, culture, confidence: conf, probs, status,
                analysisId: anKey.get(`${rd.id}|${s.id}`)!, modelVersion: s.modelVersion,
                processedAt: processed, observedFrom: obsFrom, observedTo: obsTo,
                correctedBy: status === 'corrige' ? 'Voahangy Andrianaivo' : undefined,
              };
              if (status === 'corrige') {
                corrections.push({
                  at: `${addDays(s.end, 30)}T10:00:00Z`, by: 'Voahangy Andrianaivo', seasonId: s.id,
                  from: CONFUSION[culture][0], to: culture, note: 'Corrigé après contrôle visuel sur image haute résolution.', kind: 'correction',
                });
              }
            }

            parcels.push({
              id: `PC-${cd.code}-${String(seq).padStart(5, '0')}`,
              communeId: cd.id, regionId: rd.id, coords, centroid: ctr, areaHa,
              detectionConfidence: clamp(0.62 + gauss() * 0.1 + (areaHa > 0.5 ? 0.1 : -0.05), 0.35, 0.99),
              createdAt: '2025-12-15T08:00:00Z', results, corrections,
            });
          }
        }
      }
    }
  }

  // --- Analyses (région × saison) + quelques tâches récentes
  const users = USERS;
  const analysts = ['Voahangy Andrianaivo', 'Fenosoa Randriamihaja'];
  const mkLogs = (start: string, upTo: number, warn?: string, err?: string): LogLine[] => {
    const logs: LogLine[] = [];
    const t0 = new Date(start).getTime();
    PIPELINE_STEPS.slice(0, upTo).forEach((s, i) => {
      logs.push({ at: new Date(t0 + i * 9 * 60000).toISOString(), level: 'info', msg: `${s} — terminé` });
    });
    if (warn) logs.splice(Math.min(2, logs.length), 0, { at: new Date(t0 + 20 * 60000).toISOString(), level: 'warn', msg: warn });
    if (err) logs.push({ at: new Date(t0 + upTo * 9 * 60000).toISOString(), level: 'error', msg: err });
    return logs;
  };

  for (const r of regions) {
    for (const s of SEASONS) {
      const id = anKey.get(`${r.id}|${s.id}`)!;
      const own = parcels.filter((p) => p.regionId === r.id && p.results[s.id]);
      const area = own.reduce((a, p) => a + p.areaHa, 0);
      const cloudy = r.id === 'alaotra_mangoro' && s.type === 'P';
      const started = s.id === '2026-C' ? '2026-10-08T03:10:00Z' : `${addDays(s.end, 8)}T07:00:00Z`;
      analyses.push({
        id, zoneLabel: `Région ${r.name}`, regionId: r.id, seasonId: s.id,
        status: cloudy ? 'terminee_avertissements' : 'terminee', progress: 100,
        createdBy: analysts[rint(0, 1)], createdAt: started, startedAt: started,
        finishedAt: new Date(new Date(started).getTime() + 74 * 60000).toISOString(),
        pipelineVersion: s.modelVersion, scenes: rint(38, 96), parcelCount: own.length, areaHa: area,
        warnings: cloudy ? ['Couverture nuageuse moyenne de 41 % : 3 acquisitions écartées, composite sur 5 dates.'] : [],
        logs: mkLogs(started, PIPELINE_STEPS.length, cloudy ? 'Couverture nuageuse élevée sur la période — composite mensuel dégradé.' : undefined),
      });
    }
  }
  anSeq += 1;
  analyses.push({
    id: `AN-2026-${String(anSeq).padStart(3, '0')}`, zoneLabel: 'Commune Moramanga', communeId: 'moramanga', seasonId: '2026-C',
    status: 'echec', progress: 38, createdBy: 'Voahangy Andrianaivo', createdAt: '2026-10-09T13:00:00Z', startedAt: '2026-10-09T13:01:00Z',
    pipelineVersion: CURRENT_MODEL, scenes: 0, warnings: [],
    error: 'Aucune scène Sentinel-2 exploitable : couverture nuageuse supérieure à 80 % sur toute la période.',
    logs: mkLogs('2026-10-09T13:01:00Z', 3, 'Couverture nuageuse supérieure à 80 % sur 11 des 12 scènes.', 'Échec : jeu d\u2019images insuffisant pour produire un composite fiable.'),
  });
  anSeq += 1;
  analyses.push({
    id: `AN-2026-${String(anSeq).padStart(3, '0')}`, zoneLabel: 'Zone dessinée · Faratsiho nord', communeId: 'faratsiho', seasonId: '2026-C',
    status: 'en_cours', progress: 57, createdBy: 'Fenosoa Randriamihaja', createdAt: '2026-10-10T05:40:00Z', startedAt: '2026-10-10T05:42:00Z',
    pipelineVersion: CURRENT_MODEL, scenes: 24, warnings: [], logs: mkLogs('2026-10-10T05:42:00Z', 4),
  });
  anSeq += 1;
  analyses.push({
    id: `AN-2026-${String(anSeq).padStart(3, '0')}`, zoneLabel: 'Commune Ankazobe', communeId: 'ankazobe', seasonId: '2026-C',
    status: 'en_attente', progress: 0, createdBy: 'Fenosoa Randriamihaja', createdAt: '2026-10-10T06:15:00Z',
    pipelineVersion: CURRENT_MODEL, scenes: 0, warnings: [], logs: [],
  });
  analyses.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // --- Journal d'audit initial
  const actions: [string, string][] = [
    ['Connexion', 'Session'], ['Export CSV', 'Filtre : orge · Vakinankaratra'], ['Correction de classe', 'Parcelle PC-ATB-00231'],
    ['Lancement d’analyse', 'Région Itasy · Contre-saison 2026'], ['Export GeoJSON', 'Filtre : riz · Alaotra-Mangoro'],
    ['Saisie d’observation terrain', 'Parcelle PC-BTF-00412'], ['Modification de rôle', 'Compte Soa Rasoanaivo'],
    ['Rejet de polygone', 'Parcelle PC-FRT-00877'],
  ];
  const audit: AuditEntry[] = Array.from({ length: 28 }, (_, i) => {
    const [action, object] = actions[i % actions.length];
    const u = users[(i * 3) % users.length];
    return { id: `au${i}`, at: new Date(Date.parse('2026-10-10T07:00:00Z') - i * 5.3 * 3600000).toISOString(), userName: u.name, action, object };
  });

  void regionDef;
  return { regions, communes, parcels, analyses, users, audit };
}
