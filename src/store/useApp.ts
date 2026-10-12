import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Analysis, AuditEntry, Commune, CultureId, Filters, LatLng, Parcel, Region, Role, User,
} from '../types';
import { AREA_MAX, DEFAULT_COLORS, DEFAULT_SEASON, PIPELINE_STEPS, CURRENT_MODEL } from '../data/constants';
import { USERS } from '../data/generate';
import { api } from '../api/services';
import { pointInPolygon } from '../lib/geometry';

export const DEFAULT_FILTERS: Filters = {
  cultures: [], mode: 'general', othersStyle: 'grise',
  regionId: null, communeId: null, seasonId: DEFAULT_SEASON,
  dateFrom: '', dateTo: '', areaMin: 0, areaMax: AREA_MAX, confMin: 0, statuses: [],
};

export interface FlyTarget { bounds?: [LatLng, LatLng]; center?: LatLng; zoom?: number; nonce: number }
export interface Toast { id: number; msg: string; tone: 'ok' | 'info' | 'warn' | 'danger' }

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
      parcels: [], regions: [], communes: [], analyses: [], users: USERS, audit: [],
      user: null,
      colors: { ...DEFAULT_COLORS },
      colorsByUser: {},
      threshold: 0.55,
      basemap: 'plan',
      showCoverage: true,
      filters: DEFAULT_FILTERS,
      selectedId: null,
      fly: null,
      filtersOpen: false,
      setFiltersOpen: (v) => set({ filtersOpen: v }),
      drawing: false, draft: [], zone: null,
      toasts: [],

      init: async () => {
        if (get().ready) return;
        const db = await api.bootstrap();
        set({ parcels: db.parcels, regions: db.regions, communes: db.communes, analyses: db.analyses, users: db.users, audit: db.audit, ready: true });
        // Ouverture directe sur la carte : profil analyste par défaut, modifiable depuis le menu utilisateur.
        if (!get().user) get().login('analyste');
      },

      login: (role) => {
        const u = USERS.find((x) => x.role === role && x.active)!;
        set((s) => ({ user: u, colors: s.colorsByUser[u.id] ?? { ...DEFAULT_COLORS } }));
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
      partialize: (s) => ({ user: s.user, colors: s.colors, colorsByUser: s.colorsByUser, threshold: s.threshold, basemap: s.basemap, showCoverage: s.showCoverage }),
    },
  ),
);

/** Simule l'exécution asynchrone d'un pipeline (Celery côté vrai backend). */
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
