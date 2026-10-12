import type { CultureDef, CultureId, Role, Season, Status, AnalysisStatus } from '../types';

export const CULTURES: CultureDef[] = [
  { id: 'orge', label: 'Orge', color: '#E3B505', kind: 'culture' },
  { id: 'riz', label: 'Riz', color: '#3E9B4F', kind: 'culture' },
  { id: 'haricot', label: 'Haricot', color: '#3A6EDC', kind: 'culture' },
  { id: 'mais', label: 'Maïs', color: '#E8793A', kind: 'culture' },
  { id: 'manioc', label: 'Manioc', color: '#8C6A4F', kind: 'culture' },
  { id: 'pomme_de_terre', label: 'Pomme de terre', color: '#B34FA0', kind: 'culture' },
  { id: 'autre', label: 'Autre culture', color: '#7B5FC6', kind: 'culture' },
  { id: 'jachere', label: 'Jachère', color: '#CDB892', kind: 'couverture' },
  { id: 'sol_nu', label: 'Sol nu', color: '#A59D93', kind: 'couverture' },
  { id: 'vegetation', label: 'Végétation naturelle', color: '#1E6B4B', kind: 'couverture' },
  { id: 'eau', label: 'Eau', color: '#5BB9E6', kind: 'couverture' },
  { id: 'inconnue', label: 'Inconnue', color: '#8A9199', kind: 'couverture' },
];

export const CULTURE_BY_ID = Object.fromEntries(CULTURES.map((c) => [c.id, c])) as Record<CultureId, (typeof CULTURES)[number]>;
export const DEFAULT_COLORS = Object.fromEntries(CULTURES.map((c) => [c.id, c.color])) as Record<CultureId, string>;
export const cultureLabel = (id: CultureId) => CULTURE_BY_ID[id].label;

export const SEASONS: Season[] = [
  { id: '2026-C', label: '2026 · Contre-saison (mai–oct.)', short: 'Contre-saison 2026', start: '2026-05-01', end: '2026-10-31', type: 'C', modelVersion: 'RF 1.1.0 / ResUNet 1.2.0', note: 'Acquisition en cours' },
  { id: '2025-2026-P', label: '2025–2026 · Saison des pluies (nov.–avr.)', short: 'Pluies 2025–26', start: '2025-11-01', end: '2026-04-30', type: 'P', modelVersion: 'RF 1.1.0 / ResUNet 1.2.0' },
  { id: '2025-C', label: '2025 · Contre-saison (mai–oct.)', short: 'Contre-saison 2025', start: '2025-05-01', end: '2025-10-31', type: 'C', modelVersion: 'RF 0.9.2 / U-Net 0.9.0' },
  { id: '2024-2025-P', label: '2024–2025 · Saison des pluies (nov.–avr.)', short: 'Pluies 2024–25', start: '2024-11-01', end: '2025-04-30', type: 'P', modelVersion: 'RF 0.9.2 / U-Net 0.9.0' },
];
export const SEASON_BY_ID = Object.fromEntries(SEASONS.map((s) => [s.id, s]));
export const DEFAULT_SEASON = '2026-C';
export const CURRENT_MODEL = 'RF 1.1.0 / ResUNet 1.2.0';

export const STATUS_LABEL: Record<Status, string> = {
  non_verifie: 'Non vérifié',
  verifie_terrain: 'Vérifié sur le terrain',
  corrige: 'Corrigé',
  incertain: 'Incertain',
  obsolete: 'Obsolète',
};
export const STATUS_TONE: Record<Status, string> = {
  non_verifie: 'neutral', verifie_terrain: 'ok', corrige: 'info', incertain: 'warn', obsolete: 'muted',
};

export const ANALYSIS_LABEL: Record<AnalysisStatus, string> = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  terminee: 'Terminée',
  terminee_avertissements: 'Terminée avec avertissements',
  echec: 'Échec',
};
export const ANALYSIS_TONE: Record<AnalysisStatus, string> = {
  en_attente: 'neutral', en_cours: 'info', terminee: 'ok', terminee_avertissements: 'warn', echec: 'danger',
};

export const PIPELINE_STEPS = [
  'Récupération des images Sentinel-2 et Sentinel-1',
  'Masquage des nuages et ombres',
  'Composites temporels et indices de végétation',
  'Découpage en tuiles géoréférencées',
  'Segmentation des parcelles (ResUNet)',
  'Vectorisation et contrôle des géométries',
  'Classification des cultures (Random Forest)',
  'Enregistrement et publication des résultats',
];

export interface RoleDef {
  label: string; description: string;
  can: { correct: boolean; observe: boolean; launch: boolean; export: boolean; admin: boolean; models: boolean; analyses: boolean };
}
export const ROLES: Record<Role, RoleDef> = {
  admin: {
    label: 'Administrateur',
    description: 'Comptes, rôles, paramètres, modèles et journaux.',
    can: { correct: true, observe: true, launch: true, export: true, admin: true, models: true, analyses: true },
  },
  analyste: {
    label: 'Analyste SIG/agricole',
    description: 'Lance les analyses, valide les parcelles, exporte.',
    can: { correct: true, observe: true, launch: true, export: true, admin: false, models: true, analyses: true },
  },
  terrain: {
    label: 'Agent de terrain',
    description: 'Saisit et vérifie les cultures observées.',
    can: { correct: false, observe: true, launch: false, export: false, admin: false, models: false, analyses: false },
  },
  lecteur: {
    label: 'Utilisateur lecteur',
    description: 'Consulte la carte, filtre et télécharge les exports autorisés.',
    can: { correct: false, observe: false, launch: false, export: true, admin: false, models: false, analyses: false },
  },
  gestionnaire: {
    label: 'Gestionnaire de projet',
    description: 'Suit les analyses, la qualité et la couverture.',
    can: { correct: false, observe: false, launch: false, export: true, admin: false, models: true, analyses: true },
  },
};

export const AREA_MAX = 10; // ha — curseur de superficie (10 = sans plafond)
export const DISCLAIMER =
  "Estimations produites par IA. Les contours détectés sont des objets d'analyse agricole, pas des limites foncières officielles.";
