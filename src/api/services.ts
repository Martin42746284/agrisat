/**
 * Couche « API » — backend Malto (FastAPI + Neon PostgreSQL).
 *
 * Bootstrap : 100 % données réelles (parcelles FTW + tracés VHR) via realBootstrap.
 * Aucune donnée fictive n'est utilisée à la place des données de la base.
 *
 * Routes Malto utilisées :
 *   bootstrap()       → GET /api/parcelles + GET /api/zone-parcels (parcelles réelles)
 *   createExport(f)   → simulation locale (route absente côté Malto)
 *   reportParcel(...) → simulation locale (route absente côté Malto)
 *
 * Configuration (fichier .env à la racine, cf. .env.example) :
 *   VITE_MALTO_API_URL=http://localhost:3001   ← sans slash final
 */
import type { Analysis, AuditEntry, Commune, Parcel, Region, User } from '../types';
import { request, API_BASE } from './http';
import { bootstrapReal } from './realBootstrap';

/** Réponse du bootstrap pour le store (mêmes champs que l'ancien FakeDb). */
export interface BootstrapDb {
  regions: Region[];
  communes: Commune[];
  parcels: Parcel[];
  analyses: Analysis[];
  users: User[];
  audit: AuditEntry[];
}

export const maltoConfigured = () => API_BASE.length > 0;export interface ExportJob { id: string; url: string }/** * Modèles IA réellement déployés côté Malto (GET /api/modeles). * `classification_orge` : pipeline RF sklearn (projet modele_orge, métriques du * jeu de test indépendant) ; `delimitation_vhr` : état du service de tracage VHR. */export interface DeployedModels {  classification_orge: {    nom: string; type: string; fichier: string; present: boolean;    statut: 'pret' | 'fichier absent' | 'indisponible';    modifie_le?: string;    metriques?: {      seuil: number; accuracy: number; precision_orge: number; rappel_orge: number;      precision_non_orge: number; rappel_non_orge: number; f1_orge: number;      roc_auc: number; pr_auc: number; tn: number; fp: number; fn: number; tp: number;    };    entrainement?: {      n_features: number; n_lignes: number; n_splits: number; anti_leakage_ok: boolean;      meilleurs_parametres: Record<string, string | number | null>;    };  };  delimitation_vhr: {    nom: string; type: string; service: string;    statut: 'pret' | 'injoignable' | 'erreur';    modele_charge?: string;    modele_present?: boolean;    modes?: string[];  };}

/** Payload POST /api/analyze — schéma Malto AnalyzeSimpleRequest (champs requis : latitude, longitude, radius en m). */
export interface AnalyzeSimplePayload {
  latitude: number;
  longitude: number;
  radius: number;
  confidence_threshold?: number;
  min_area_ha?: number;
  base_temperature?: number;
  threshold?: number;
  period_days?: number;
  traced_parcels?: unknown[];
}

/** Payload POST /api/detect-parcels — schéma Malto AutomaticDetectionRequest (GDD obligatoire). */
export interface DetectParcelsPayload {
  lat: number;
  lng: number;
  radiusKm: number;
  baseTemperature: number;
  threshold: number;
  periodDays: number;
  tracedParcels?: unknown[];
}

/** Feature GeoJSON renvoyée par POST /api/analyze avec traced_parcels (classification orge). */
export interface AnalyzeSimpleFeature {
  geometry?: { type?: string; coordinates?: number[][][] };
  properties?: {
    class?: string;            // « ORGE »
    confidence?: number;       // 0–100
    areaHa?: number;
    meanNDVI?: number | null;
    meanNDRE?: number | null;
    imageDate?: string | null;
    barleyPresence?: 'confirmed' | 'probable';
    [k: string]: unknown;
  };
}

export interface AnalyzeSimpleResult {
  analysisId?: string | null;
  analysisDate?: string;
  imageDate?: string;
  imageAgeDays?: number;
  cloudPercentage?: number;
  confidenceThreshold?: number;
  minAreaHa?: number;
  candidatesFound?: number;
  candidatesClassified?: number;
  parcels?: unknown[];
  features?: AnalyzeSimpleFeature[];
  warnings?: string[];
  [k: string]: unknown;
}

/** Payload POST /api/zone-parcels — schéma Malto ZoneParcelsRequest (champs requis : latitude, longitude). */
export interface ZoneParcelsPayload {
  latitude: number;
  longitude: number;
  radius_m?: number;
  min_confidence?: number;
  min_area_ha?: number;
  mode?: 'simple' | 'mix';
}

export interface ZoneParcelsResult {
  geojson?: { type?: string; features?: unknown[] };
  summary?: {
    n_parcels?: number;
    area_ha_total?: number;
    truncated?: boolean;
    by_size?: { range: string; n_parcels: number }[];
    quality?: Record<string, unknown>;
    [k: string]: unknown;
  };
  attribution?: string;
  warnings?: string[];
  [k: string]: unknown;
}

export const api = {
  /** Charge les données réelles de la base au démarrage (aucune donnée fictive). */
  async bootstrap(): Promise<BootstrapDb> {
    try {
      return await bootstrapReal();
    } catch (err) {
      console.error('[AgriSat] Bootstrap Malto échoué — pas de données à afficher :', err);
      return { regions: [], communes: [], parcels: [], analyses: [], users: [], audit: [] };
    }
  },

  /** Malto n'expose pas encore de route d'export — simulation locale conservée. */
  async createExport(format: string): Promise<ExportJob> {
    if (maltoConfigured()) {
      try {
        // Si Malto ajoute POST /api/exports un jour, ce chemin sera utilisé.
        return await request<ExportJob>('/api/exports', { method: 'POST', body: JSON.stringify({ format }) });
      } catch (err) {
        console.warn('[AgriSat] Export via Malto indisponible, simulation locale :', err);
      }
    }
    await wait(EXPORT_FALLBACK_MS);
    return { id: `EX-${Date.now().toString(36).toUpperCase()}`, url: '' };
  },
  /** Inventaire des modèles IA réellement déployés (RF orge + délimitation VHR). */
  async getDeployedModels(): Promise<DeployedModels> {
    return request<DeployedModels>('/api/modeles');
  },

  /** Analyse simple (modèles IA Malto : classification RF orge + traitement Sentinel-2). */
  async analyzeSimple(payload: AnalyzeSimplePayload): Promise<AnalyzeSimpleResult> {
    return request<AnalyzeSimpleResult>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, ANALYZE_TIMEOUT_MS);
  },

  /** Détection automatique de parcelles (GDD + base parcelles). */
  async detectParcels(payload: DetectParcelsPayload): Promise<AnalyzeSimpleResult> {
    return request<AnalyzeSimpleResult>('/api/detect-parcels', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, ANALYZE_TIMEOUT_MS);
  },

  /**
   * Tracés VHR (modèle Delineate Anything JECAM) — délimitation automatique de parcelles.
   * `signal` permet d'annuler la requête (démontage, changement de zone).
   */
  async zoneParcels(payload: ZoneParcelsPayload, signal?: AbortSignal): Promise<ZoneParcelsResult> {
    return request<ZoneParcelsResult>('/api/zone-parcels', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: signal ?? null,
    }, ZONE_PARCELS_TIMEOUT_MS);
  },

  /** Route absente côté Malto — simulation locale conservée. */
  async reportParcel(id: string, message: string): Promise<void> {
    if (!maltoConfigured()) { await wait(EXPORT_REPORT_FALLBACK_MS); return; }
    try {
      await request(`/api/parcelles/${encodeURIComponent(id)}/signalements`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
    } catch (err) {
      console.warn('[AgriSat] Signalement non envoyé (route Malto absente) :', err);
    }
  },
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EXPORT_FALLBACK_MS = 700;
const EXPORT_REPORT_FALLBACK_MS = 400;
// Les appels d'inférence Malto sont longs (scènes Sentinel-2 + modèle) : timeouts dédiés.
const ANALYZE_TIMEOUT_MS = 240_000;
const ZONE_PARCELS_TIMEOUT_MS = 600_000; // mode « mix » ≈ 5–7 min
