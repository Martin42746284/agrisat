export type LatLng = [number, number]; // [lat, lng] (ordre Leaflet)

export type CultureId =
  | 'orge' | 'riz' | 'haricot' | 'mais' | 'manioc' | 'pomme_de_terre'
  | 'autre' | 'jachere' | 'sol_nu' | 'vegetation' | 'eau' | 'inconnue';

export type Status = 'non_verifie' | 'verifie_terrain' | 'corrige' | 'incertain' | 'obsolete';
export type DisplayMode = 'general' | 'filtre' | 'comparatif';
export type OthersStyle = 'grise' | 'masque';
export type Role = 'admin' | 'analyste' | 'terrain' | 'lecteur' | 'gestionnaire';
export type Coverage = 'analysee' | 'partielle' | 'non_analysee';
export type AnalysisStatus = 'en_attente' | 'en_cours' | 'terminee' | 'terminee_avertissements' | 'echec';

export interface CultureDef { id: CultureId; label: string; color: string; kind: 'culture' | 'couverture' }

export interface Season {
  id: string; label: string; short: string;
  start: string; end: string; type: 'P' | 'C'; modelVersion: string; note?: string;
}

export interface Region { id: string; name: string; center: LatLng; outline: LatLng[] }

export interface Commune {
  id: string; regionId: string; name: string; code: string;
  center: LatLng; outline: LatLng[];
  coverage: Coverage; imageDate: string | null; cloudCover: number;
}

export interface CropResult {
  seasonId: string;
  culture: CultureId;
  confidence: number;
  probs: Partial<Record<CultureId, number>>;
  status: Status;
  analysisId: string;
  modelVersion: string;
  processedAt: string;
  observedFrom: string;
  observedTo: string;
  correctedBy?: string;
}

export interface Correction {
  at: string; by: string; seasonId: string;
  from: CultureId; to: CultureId; note: string;
  kind: 'correction' | 'observation';
}

export interface Parcel {
  id: string; communeId: string; regionId: string;
  coords: LatLng[]; centroid: LatLng;
  areaHa: number; detectionConfidence: number; createdAt: string;
  results: Record<string, CropResult>;
  corrections: Correction[];
  rejected?: boolean;
}

export interface ParcelView { p: Parcel; r: CropResult }

export interface User {
  id: string; name: string; email: string; role: Role; active: boolean; lastLogin: string;
}

export interface AuditEntry {
  id: string; at: string; userName: string; action: string; object: string;
}

export interface LogLine { at: string; level: 'info' | 'warn' | 'error'; msg: string }

export interface Analysis {
  id: string; zoneLabel: string; regionId?: string; communeId?: string; seasonId: string;
  status: AnalysisStatus; progress: number;
  createdBy: string; createdAt: string; startedAt?: string; finishedAt?: string;
  pipelineVersion: string; scenes: number;
  parcelCount?: number; areaHa?: number;
  warnings: string[]; logs: LogLine[]; cached?: boolean; error?: string;
}

export interface Filters {
  cultures: CultureId[];
  mode: DisplayMode;
  othersStyle: OthersStyle;
  regionId: string | null;
  communeId: string | null;
  seasonId: string;
  dateFrom: string;
  dateTo: string;
  areaMin: number;
  areaMax: number;
  confMin: number; // 0..100
  statuses: Status[];
}
