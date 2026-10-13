# Cartographie agricole de Madagascar — frontend (données fictives)

React 18 + TypeScript + Vite · Leaflet · Zustand · Recharts.
Toutes les données (parcelles, cultures, analyses, métriques IA) sont **générées** (`src/data/generate.ts`, graine fixe) : rien n'est réel.

## Lancer
```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```
Aucune variable d'environnement. Les fonds de carte (OSM, Esri) nécessitent Internet ; vérifier leurs licences avant production.

## Ce qui est couvert (cahier des charges)
| Exigence | Où |
|---|---|
| Carte, recherche de lieu, retour national, plan/satellite | `MapView`, `MapToolbar` |
| Zone d'étude dessinée (sommets déplaçables, suppression) | `MapToolbar`, `MapView` |
| Filtre par culture (ex. orge), plusieurs cultures, couleurs libres en temps réel (REC-05/06) | `CultureRail`, `lib/style.ts` |
| Vues générale / filtrée (griser ou masquer) / comparative + légende (REC-07) | `MapPage`, `Legend` |
| Filtres région, commune, saison, date, superficie, confiance, statut ; réinitialisation | `FiltersPanel` |
| Compteur parcelles + superficie qui suit les filtres (REC-08) | `MapPage`, `lib/filter.ts` |
| Incertain / obsolète / non classé / commune sans donnée distingués (REC-09) | contours pointillés, couche « couverture » |
| Fiche parcelle : probabilités, historique, corrections | `ParcelDrawer` |
| Tableau de bord partageant les mêmes filtres, comparaison de 2 saisons | `Dashboard` |
| Analyses asynchrones (états, journal, relance, cache) | `Analyses`, `store/useApp.ts` |
| Exports CSV / GeoJSON réels, rapport PDF (impression) (REC-10) | `ExportMenu`, `lib/exporters.ts` |
| Rôles et permissions (REC-12), journal d'audit | `data/constants.ts` (ROLES), `Admin` |
| Modèles IA : versions, F1, matrice de confusion | `Models` |

## Brancher le backend Malto
La couche API (`src/api/services.ts`) interroge désormais le backend Malto (FastAPI + PostgreSQL/PostGIS) : routes
`GET /api/bootstrap`, `POST /api/exports`, `POST /api/parcelles/{id}/signalements`. Pour l'activer, copier
`.env.example` en `.env` puis renseigner `VITE_MALTO_API_URL` (sans slash final). Sans cette variable, l'app
retombe automatiquement sur les données fictives locales (prototype). Un serveur Malto de test (mêmes routes,
données générées) est fourni : `npx tsx scripts/malto-test-server.mjs` (port 8000).

Le filtrage est fait côté client (3 800 parcelles) ; en production il doit être fait côté serveur (PostGIS) avec
chargement par emprise/tuiles vectorielles.

## Limites connues du prototype
- Fusion / scission de polygones : boutons désactivés (à relier à PostGIS).
- GeoPackage / Shapefile : prévus côté API.
- Authentification simulée : ouverture directe sur la carte (profil analyste), changement de profil depuis le menu en haut à droite.
