import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Analysis, AuditEntry, Commune, CultureId, Filters, LatLng, Parcel, Region, Role, User,
} from '../types';
import { AREA_MAX, DEFAULT_COLORS, DEFAULT_SEASON, PIPELINE_STEPS, CURRENT_MODEL } from '../data/constants';
import { api, maltoConfigured, type AnalyzeSimpleFeature } from '../api/services';
import { maltoVhrToFrontend, type MaltoVhrFeature } from '../api/maltoAdapter';
import { pointInPolygon } from '../lib/geometry';

export const DEFAULT_FILTERS: Filters = {
  cultures: [], mode: 'general', othersStyle: 'grise',
  regionId: null, communeId: null, seasonId: DEFAULT_SEASON,
  dateFrom: '', dateTo: '', areaMin: 0, areaMax: AREA_MAX, confMin: 0, statuses: [],
};

export interface FlyTarget { bounds?: [LatLng, LatLng]; center?: LatLng; zoom?: number; nonce: number }
export interface Toast { id: number; msg: string; tone: 'ok' | 'info' | 'warn' | 'danger' }

/** Résumé du dernier traçage automatique (contours IA — à présenter comme indicatifs). */
export interface TraceInfo {
  count: number;   // contours renvoyés par le backend
  added: number;   // vraiment nouveaux (hors doublons déjà présents)
  attribution?: string;
  warnings: string[];
  at: string;
}

interface State {
  ready: boolean;
  parcels: Parcel[]; regions: Region[]; communes: Commune[];
  analyses: Analysis[]; users: User[]; audit: AuditEntry[];

  user: User | null;
  colors: Record<CultureId, string>;
  colorsByUser: Record<string, Record<CultureId, string>>;
  threshold: number;
  basemap: 'plan' | 'satellite';
  showCoverage: boolean;

  filters: Filters;
  selectedId: string | null;
  fly: FlyTarget | null;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;

  drawing: boolean; draft: LatLng[]; zone: LatLng[] | null;
  toasts: Toast[];
  traceInfo: TraceInfo | null;

  init: () => Promise<void>;
  login: (role: Role) => void;
  logout: () => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  toggleCulture: (id: CultureId) => void;
  setColor: (id: CultureId, color: string) => void;
  resetColors: () => void;
  setThreshold: (v: number) => void;
  setBasemap: (b: 'plan' | 'satellite') => void;
  setShowCoverage: (v: boolean) => void;
  select: (id: string | null) => void;
  flyTo: (t: Omit<FlyTarget, 'nonce'>) => void;

  startDraw: () => void; addDraftPoint: (p: LatLng) => void; undoDraft: () => void;
  finishDraw: () => void; cancelDraw: () => void; setZone: (z: LatLng[] | null) => void;

  toast: (msg: string, tone?: Toast['tone']) => void;
  logAudit: (action: string, object: string) => void;
  correctParcel: (id: string, to: CultureId, note: string, kind: 'correction' | 'observation') => void;
  rejectParcel: (id: string) => void;
  createAnalysis: (input: { zoneLabel: string; regionId?: string; communeId?: string; seasonId: string; zone?: LatLng[] | null }) => Analysis;
  addTracedParcels: (added: Parcel[], info: TraceInfo) => number;
  relaunchAnalysis: (id: string) => void;
  setUserRole: (id: string, role: Role) => void;
  toggleUserActive: (id: string) => void;
}

let toastSeq = 1;
let flySeq = 1;
const rint = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      ready: false,
      parcels: [], regions: [], communes: [], analyses: [], users: [], audit: [],
      user: null,
      colors: { ...DEFAULT_COLORS },
      colorsByUser: {},
      threshold: 0.55,
      basemap: 'satellite',
      showCoverage: true,
      filters: DEFAULT_FILTERS,
      selectedId: null,
      fly: null,
      filtersOpen: false,
      setFiltersOpen: (v) => set({ filtersOpen: v }),
      drawing: false, draft: [], zone: null,
      toasts: [],
      traceInfo: null,

      init: async () => {
        if (get().ready) return;
        const db = await api.bootstrap();
        set({ parcels: db.parcels, regions: db.regions, communes: db.communes, analyses: db.analyses, users: db.users, audit: db.audit, ready: true });
        // Ouverture directe sur la carte : profil analyste par défaut, modifiable depuis le menu utilisateur.
        if (!get().user) get().login('analyste');
      },

      login: (role) => {
        const s = get();
        // Compte de session local (l'authentification réelle viendra de Malto).
        let u = s.users.find((x) => x.role === role && x.active) ??
          ({ id: `local-${role}`, name: `Session ${role}`, email: '', role, active: true, lastLogin: new Date().toISOString() } as User);
        if (!s.users.some((x) => x.id === u.id)) {
          set((st) => ({ users: [u, ...st.users] }));
        }
        set((s2) => ({ user: u, colors: s2.colorsByUser[u.id] ?? { ...DEFAULT_COLORS } }));
        get().logAudit('Connexion', 'Session');
      },
      logout: () => set({ user: null, selectedId: null }),

      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      resetFilters: () => set((s) => ({ filters: { ...DEFAULT_FILTERS, seasonId: s.filters.seasonId }, zone: null })),
      toggleCulture: (id) =>
        set((s) => {
          const has = s.filters.cultures.includes(id);
          const cultures = has ? s.filters.cultures.filter((c) => c !== id) : [...s.filters.cultures, id];
          let mode = s.filters.mode;
          if (cultures.length === 0) mode = 'general';
          else if (mode === 'general') mode = 'filtre';
          return { filters: { ...s.filters, cultures, mode } };
        }),
      setColor: (id, color) =>
        set((s) => {
          const colors = { ...s.colors, [id]: color };
          return { colors, colorsByUser: s.user ? { ...s.colorsByUser, [s.user.id]: colors } : s.colorsByUser };
        }),
      resetColors: () =>
        set((s) => ({
          colors: { ...DEFAULT_COLORS },
          colorsByUser: s.user ? { ...s.colorsByUser, [s.user.id]: { ...DEFAULT_COLORS } } : s.colorsByUser,
        })),
      setThreshold: (v) => set({ threshold: v }),
      setBasemap: (b) => set({ basemap: b }),
      setShowCoverage: (v) => set({ showCoverage: v }),
      select: (id) => set({ selectedId: id }),
      flyTo: (t) => set({ fly: { ...t, nonce: flySeq++ } }),

      startDraw: () => set({ drawing: true, draft: [], selectedId: null }),
      addDraftPoint: (p) => set((s) => ({ draft: [...s.draft, p] })),
      undoDraft: () => set((s) => ({ draft: s.draft.slice(0, -1) })),
      finishDraw: () => {
        const { draft } = get();
        if (draft.length < 3) { get().toast('Placez au moins 3 points pour fermer la zone.', 'warn'); return; }
        set({ zone: draft, draft: [], drawing: false });
        get().toast('Zone d’étude créée. Les filtres et statistiques s’y limitent.', 'ok');
      },
      cancelDraw: () => set({ drawing: false, draft: [] }),
      setZone: (z) => set({ zone: z }),

      addTracedParcels: (added, info) => {
        const existing = new Set(get().parcels.map((p) => p.id));
        const fresh = added.filter((p) => !existing.has(p.id));
        // `info.added` est recalculé ici : nombre réel de contours nouveaux.
        set((s) => ({ parcels: [...s.parcels, ...fresh], traceInfo: { ...info, added: fresh.length } }));
        return fresh.length;
      },

      toast: (msg, tone = 'info') => {
        const id = toastSeq++;
        set((s) => ({ toasts: [...s.toasts, { id, msg, tone }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
      },
      logAudit: (action, object) => {
        const u = get().user;
        if (!u) return;
        const e: AuditEntry = { id: `au${Date.now()}${Math.random()}`, at: new Date().toISOString(), userName: u.name, action, object };
        set((s) => ({ audit: [e, ...s.audit] }));
      },

      correctParcel: (id, to, note, kind) => {
        const s = get();
        const seasonId = s.filters.seasonId;
        const by = s.user?.name ?? 'Inconnu';
        set({
          parcels: s.parcels.map((p) => {
            if (p.id !== id) return p;
            const r = p.results[seasonId];
            if (!r) return p;
            return {
              ...p,
              results: {
                ...p.results,
                [seasonId]: { ...r, culture: to, status: kind === 'observation' ? 'verifie_terrain' : 'corrige', correctedBy: by },
              },
              corrections: [...p.corrections, { at: new Date().toISOString(), by, seasonId, from: r.culture, to, note, kind }],
            };
          }),
        });
        get().logAudit(kind === 'observation' ? 'Saisie d’observation terrain' : 'Correction de classe', `Parcelle ${id}`);
      },
      rejectParcel: (id) => {
        set((s) => ({ parcels: s.parcels.map((p) => (p.id === id ? { ...p, rejected: true } : p)), selectedId: null }));
        get().logAudit('Rejet de polygone', `Parcelle ${id}`);
      },

      createAnalysis: ({ zoneLabel, regionId, communeId, seasonId, zone }) => {
        const s = get();
        const now = new Date().toISOString();
        const id = `AN-2026-${String(s.analyses.length + 40).padStart(3, '0')}`;
        const cached = s.analyses.find(
          (a) => a.seasonId === seasonId && (a.status === 'terminee' || a.status === 'terminee_avertissements') &&
            ((communeId && a.communeId === communeId) || (!communeId && regionId && a.regionId === regionId && !a.communeId)),
        );
        const inScope = s.parcels.filter(
          (p) => p.results[seasonId] && (communeId ? p.communeId === communeId : regionId ? p.regionId === regionId : true) &&
            (!zone || pointInPolygon(p.centroid, zone)),
        );
        const base: Analysis = {
          id, zoneLabel, regionId, communeId, seasonId, status: 'en_attente', progress: 0,
          createdBy: s.user?.name ?? '—', createdAt: now, pipelineVersion: CURRENT_MODEL, scenes: 0, warnings: [], logs: [],
        };
        if (cached) {
          const a: Analysis = {
            ...base, status: 'terminee', progress: 100, cached: true, startedAt: now, finishedAt: now,
            parcelCount: inScope.length, areaHa: inScope.reduce((t, p) => t + p.areaHa, 0), scenes: cached.scenes,
            logs: [{ at: now, level: 'info', msg: `Entrées identiques déjà traitées (${cached.id}) — résultats réutilisés depuis le cache, aucun calcul relancé.` }],
          };
          set({ analyses: [a, ...s.analyses] });
          get().logAudit('Lancement d’analyse (cache)', zoneLabel);
          return a;
        }
        set({ analyses: [base, ...s.analyses] });
        get().logAudit('Lancement d’analyse', `${zoneLabel} · ${seasonId}`);
        if (api && 'analyzeSimple' in api) {
          try {
            if (maltoConfigured()) {
              const center = pickCenter(s, { zoneLabel, regionId, communeId, zone });
              const radiusM = pickRadiusM({ zone, center });
              void runMaltoPipeline(id, center, radiusM, seasonId, zone ?? null).then((res) => {
                const warns = res.warnings;
                const ended = new Date().toISOString();
                set((st) => ({
                  analyses: st.analyses.map((x) =>
                    x.id === id ? {
                      ...x,
                      status: warns.length ? 'terminee_avertissements' : 'terminee',
                      progress: 100,
                      startedAt: x.startedAt ?? now,
                      finishedAt: ended,
                      pipelineVersion: 'Malto · tracé JECAM-VHR + RF orge',
                      scenes: res.scenes,
                      warnings: warns,
                      parcelCount: res.parcelCount,
                      areaHa: res.areaHa,
                      logs: [...x.logs, { at: ended, level: 'info' as const, msg: 'Pipeline Malto terminé — tracé automatique + classification orge (modèles existants).' }],
                    } : x),
                }));
                get().toast(`Analyse ${id} terminée (Malto) : ${res.tracedCount} parcelles tracées, ${res.barleyCount} orge.`, 'ok');
              }).catch((err) => {
                const ended = new Date().toISOString();
                set((st) => ({
                  analyses: st.analyses.map((x) =>
                    x.id === id ? {
                      ...x,
                      status: 'echec',
                      progress: 100,
                      startedAt: x.startedAt ?? now,
                      finishedAt: ended,
                      error: err instanceof Error ? err.message : String(err),
                      logs: [...x.logs, { at: ended, level: 'warn' as const, msg: 'Appel Malto échoué — repli sur simulation.' }],
                    } : x),
                }));
                setTimeout(() => runSimulation(id, inScope.length, inScope.reduce((t, p) => t + p.areaHa, 0), true), 400);
              });
              set((st) => ({
                analyses: st.analyses.map((x) =>
                  x.id === id ? { ...x, status: 'en_cours', startedAt: now, pipelineVersion: 'Malto /api/analyze (modèles IA réels)' } : x),
              }));
              return base;
            }
          } catch (e) {
            // Préparation de l'appel Malto impossible (ex. données de périmètre incomplètes) :
            // on journalise puis on laisse le repli simulation ci-dessous.
            console.warn('[AgriSat] Préparation de l\'analyse Malto impossible, repli simulation :', e);
          }
        }
        setTimeout(() => runSimulation(id, inScope.length, inScope.reduce((t, p) => t + p.areaHa, 0), false), 1200);
        return base;
      },

      relaunchAnalysis: (id) => {
        const s = get();
        const a = s.analyses.find((x) => x.id === id);
        if (!a) return;
        const now = new Date().toISOString();
        const inScope = s.parcels.filter((p) => p.results[a.seasonId] && (a.communeId ? p.communeId === a.communeId : true));
        set({
          analyses: s.analyses.map((x) =>
            x.id === id ? { ...x, status: 'en_attente', progress: 0, error: undefined, logs: [...x.logs, { at: now, level: 'info', msg: `Relance contrôlée par ${s.user?.name ?? '—'}.` }] } : x),
        });
        get().logAudit('Relance d’analyse', id);
        setTimeout(() => runSimulation(id, inScope.length, inScope.reduce((t, p) => t + p.areaHa, 0), true), 1200);
      },

      setUserRole: (id, role) => {
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, role } : u)) }));
        get().logAudit('Modification de rôle', `Compte ${get().users.find((u) => u.id === id)?.name}`);
      },
      toggleUserActive: (id) => {
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, active: !u.active } : u)) }));
        get().logAudit('Changement de statut de compte', `Compte ${get().users.find((u) => u.id === id)?.name}`);
      },
    }),
    {
      name: 'agri-mada-v1',
      version: 2,
      migrate: (persistedState) => ({
        ...(persistedState as Pick<State, 'user' | 'colors' | 'colorsByUser' | 'threshold' | 'showCoverage'>),
        basemap: 'satellite' as const,
      }),
      partialize: (s) => ({ user: s.user, colors: s.colors, colorsByUser: s.colorsByUser, threshold: s.threshold, basemap: s.basemap, showCoverage: s.showCoverage }),
    },
  ),
);

/** Centroïde arithmétique d'un anneau de sommets. */
function avgPoint(coords: LatLng[]): LatLng {
  if (!coords.length) return [0, 0];
  let x = 0, y = 0;
  for (const [a, b] of coords) { x += a; y += b; }
  return [x / coords.length, y / coords.length];
}

function bboxRadiusM(coords: LatLng[], center: LatLng): number {
  if (!coords.length) return 800;
  let max = 0;
  const [cx, cy] = center;
  for (const [a, b] of coords) {
    const dLat = (a - cx) * 111_000;
    const dLon = (b - cy) * 111_000 * Math.cos((cx * Math.PI) / 180);
    const d = Math.sqrt(dLat * dLat + dLon * dLon);
    if (d > max) max = d;
  }
  return Math.max(200, Math.min(5000, Math.round(max * 1.2)));
}

function pickCenter(s: any, ctx: { zoneLabel: string; regionId?: string; communeId?: string; zone?: LatLng[] | null }): LatLng {
  if (ctx.zone && ctx.zone.length >= 3) return avgPoint(ctx.zone);
  if (ctx.communeId) {
    const c = s.communes.find((x: any) => x.id === ctx.communeId);
    if (c && c.outline?.length) return avgPoint(c.outline as LatLng[]);
  }
  if (ctx.regionId) {
    const r = s.regions.find((x: any) => x.id === ctx.regionId);
    if (r && r.outline?.length) return avgPoint(r.outline as LatLng[]);
  }
  return [-19.87, 47.03]; // Antsirabe approx
}

function pickRadiusM(ctx: { zone?: LatLng[] | null; center: LatLng }): number {
  if (ctx.zone && ctx.zone.length >= 3) return bboxRadiusM(ctx.zone, ctx.center);
  return 1000;
}

/** Résultat du pipeline Malto (tracé + classification orge). */
interface MaltoPipelineResult {
  warnings: string[];
  scenes: number;
  tracedCount: number;
  barleyCount: number;
  parcelCount: number;
  areaHa: number;
}

/**
 * Pipeline complet reprenant la méthode du frontend Malto :
 *  1) tracé automatique des parcelles — POST /api/zone-parcels (modèle VHR
 *     Delineate Anything JECAM) ;
 *  2) classification orge/non-orge — POST /api/analyze avec `traced_parcels`
 *     (classifieur RF Sentinel-2 appliqué aux contours tracés).
 * Les parcelles tracées sont ajoutées au store (déduplication par id) puis
 * classées (culture orge + confiance) lorsque le backend les confirme.
 */
async function runMaltoPipeline(
  id: string,
  center: LatLng,
  radiusM: number,
  seasonId: string,
  zone: LatLng[] | null,
): Promise<MaltoPipelineResult> {
  const { getState, setState } = useApp;
  const stamp = () => new Date().toISOString();
  const patchLog = (msg: string, level: 'info' | 'warn' = 'info') =>
    setState((s) => ({
      analyses: s.analyses.map((a) =>
        a.id === id ? { ...a, logs: [...a.logs, { at: stamp(), level, msg }] } : a),
    }));

  // 1) Tracé automatique des parcelles (JECAM-VHR) autour du centre du périmètre.
  patchLog('Tracé automatique des parcelles (modèle VHR JECAM)…');
  let traced: Parcel[] = [];
  try {
    const traceRadius = Math.min(1000, Math.max(200, radiusM)); // plafond du service de tracage
    const zp = await api.zoneParcels({ latitude: center[0], longitude: center[1], radius_m: traceRadius });
    const features = (zp.geojson?.features ?? []) as MaltoVhrFeature[];
    const st = getState();
    traced = maltoVhrToFrontend(features, { regions: st.regions, communes: st.communes })
      .map((p) => ({
        ...p,
        results: { ...p.results, [seasonId]: { ...p.results[DEFAULT_SEASON], seasonId } },
      }));
    if (traced.length) {
      const existing = new Set(st.parcels.map((p) => p.id));
      const added = traced.filter((p) => !existing.has(p.id));
      setState((s2) => ({ parcels: [...s2.parcels, ...added] }));
      patchLog(
        added.length === 0
          ? `${traced.length} contours tracés (${traceRadius} m) — tous déjà présents. ` +
            'Le service de tracage sert actuellement sa base précalculée quel que soit le lieu ; ' +
            'une remesure côté service VHR est nécessaire pour obtenir de nouveaux contours.'
          : `${traced.length} contours tracés (${traceRadius} m), dont ${added.length} nouvelles parcelles.`,
      );
    } else {
      patchLog('Aucune parcelle tracée dans ce rayon (image ou service de tracage indisponible).', 'warn');
    }
  } catch (err) {
    patchLog(`Tracé automatique indisponible : ${err instanceof Error ? err.message : String(err)}`, 'warn');
  }

  // 2) Classification orge/non-orge (RF Sentinel-2) des contours tracés.
  patchLog('Classification orge/non-orge (modèle RF Sentinel-2) sur les parcelles tracées…');
  const traced_parcels = traced.slice(0, 500).map((p) => ({
    coordinates: p.coords.map(([lat, lng]) => ({ lat, lng })),
  }));
  const res = await api.analyzeSimple({
    latitude: center[0],
    longitude: center[1],
    radius: radiusM,
    traced_parcels,
  });

  // Application des verdicts orge : chaque feature est rattachée à la parcelle
  // tracée dont le centroïde est le plus proche (< 100 m).
  const feats = (res.features ?? []) as AnalyzeSimpleFeature[];
  const classified = new Map<string, { conf: number; ndvi: number | null }>();
  for (const f of feats) {
    const ring = f.geometry?.type === 'Polygon' ? (f.geometry?.coordinates ?? [])[0] : undefined;
    if (!ring || ring.length < 3) continue;
    let fx = 0, fy = 0;
    for (const [lng, lat] of ring) { fx += lng; fy += lat; }
    const flat: LatLng = [fy / ring.length, fx / ring.length];
    let best: Parcel | null = null;
    let bestD = Infinity;
    for (const p of traced) {
      const dLat = (p.centroid[0] - flat[0]) * 111_000;
      const dLon = (p.centroid[1] - flat[1]) * 111_000 * Math.cos((flat[0] * Math.PI) / 180);
      const d = Math.hypot(dLat, dLon);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best && bestD < 100) {
      const raw = f.properties?.confidence ?? 50;
      classified.set(best.id, {
        conf: Math.min(0.99, Math.max(0.05, raw > 1 ? raw / 100 : raw)),
        ndvi: typeof f.properties?.meanNDVI === 'number' ? f.properties.meanNDVI : null,
      });
    }
  }
  let barleyCount = 0;
  if (classified.size) {
    setState((s2) => ({
      parcels: s2.parcels.map((p) => {
        const c = classified.get(p.id);
        if (!c) return p;
        barleyCount++;
        return {
          ...p,
          results: {
            ...p.results,
            [seasonId]: {
              seasonId,
              culture: 'orge' as CultureId,
              confidence: c.conf,
              probs: { orge: c.conf } as Partial<Record<CultureId, number>>,
              status: 'non_verifie' as const,
              analysisId: id,
              modelVersion: `Malto RF orge${c.ndvi != null ? ` · NDVI ${Math.round(c.ndvi)} %` : ''}`,
              processedAt: stamp(),
              observedFrom: stamp().slice(0, 10),
              observedTo: stamp().slice(0, 10),
            },
          },
        };
      }),
    }));
  }
  patchLog(`${barleyCount} parcelle(s) classée(s) ORGE (confiance du modèle, seuil backend).`);

  // Stats finales recalculées sur le store à jour, limitées au périmètre de l'analyse.
  const st = getState();
  const scoped = st.parcels.filter(
    (p) => p.results[seasonId] && (!zone || pointInPolygon(p.centroid, zone)),
  );
  return {
    warnings: res.warnings ?? [],
    scenes: typeof res.candidatesClassified === 'number' ? res.candidatesClassified : traced.length,
    tracedCount: traced.length,
    barleyCount,
    parcelCount: scoped.length,
    areaHa: scoped.reduce((t, p) => t + p.areaHa, 0),
  };
}

/** Simule l'exécution asynchrone d'un pipeline — repli hors connexion Malto. */
function runSimulation(id: string, count: number, area: number, partialOutcome: boolean) {
  const { getState, setState } = useApp;
  const patch = (fn: (a: Analysis) => Analysis) =>
    setState((s) => ({ analyses: s.analyses.map((a) => (a.id === id ? fn(a) : a)) }));

  patch((a) => ({ ...a, status: 'en_cours', startedAt: new Date().toISOString(), scenes: rint(20, 80) }));
  const tick = () => {
    const a = getState().analyses.find((x) => x.id === id);
    if (!a || a.status !== 'en_cours') return;
    const next = Math.min(100, a.progress + rint(6, 14));
    const before = Math.floor((a.progress / 100) * PIPELINE_STEPS.length);
    const after = Math.floor((next / 100) * PIPELINE_STEPS.length);
    const newLogs = PIPELINE_STEPS.slice(before, after).map((m) => ({ at: new Date().toISOString(), level: 'info' as const, msg: `${m} — terminé` }));
    if (next >= 100) {
      patch((x) => ({
        ...x, progress: 100, logs: [...x.logs, ...newLogs], finishedAt: new Date().toISOString(),
        status: partialOutcome ? 'terminee_avertissements' : 'terminee',
        warnings: partialOutcome ? ['Résultat partiel : 2 scènes seulement exploitables, confiance moyenne réduite.'] : [],
        parcelCount: count, areaHa: area,
      }));
      getState().toast(`Analyse ${id} terminée.`, 'ok');
    } else {
      patch((x) => ({ ...x, progress: next, logs: [...x.logs, ...newLogs] }));
      setTimeout(tick, 900);
    }
  };
  setTimeout(tick, 900);
}
