import type { Commune, ParcelView, Region, CultureId } from '../types';
import { CULTURE_BY_ID, CULTURES, DISCLAIMER, SEASON_BY_ID, STATUS_LABEL } from '../data/constants';
import { fmtDate, fmtHa, fmtInt } from './format';

interface Ctx { communes: Commune[]; regions: Region[] }
const dec = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

export function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(views: ParcelView[], ctx: Ctx): string {
  const cm = Object.fromEntries(ctx.communes.map((c) => [c.id, c]));
  const rm = Object.fromEntries(ctx.regions.map((r) => [r.id, r]));
  const head = ['id_parcelle', 'region', 'commune', 'superficie_ha', 'culture_estimee', 'confiance_pct', 'statut', 'saison', 'obs_debut', 'obs_fin', 'date_traitement', 'version_modele', 'avertissement'];
  const rows = views.map(({ p, r }) => [
    p.id, rm[p.regionId]?.name, cm[p.communeId]?.name, dec(p.areaHa, 3), CULTURE_BY_ID[r.culture].label,
    dec(r.confidence * 100, 1), STATUS_LABEL[r.status], SEASON_BY_ID[r.seasonId]?.short, r.observedFrom, r.observedTo,
    r.processedAt.slice(0, 10), r.modelVersion, 'Estimation IA — limite non officielle',
  ]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\uFEFF' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

export function toGeoJSON(views: ParcelView[], ctx: Ctx, filtersLabel: string): string {
  const cm = Object.fromEntries(ctx.communes.map((c) => [c.id, c]));
  const rm = Object.fromEntries(ctx.regions.map((r) => [r.id, r]));
  return JSON.stringify({
    type: 'FeatureCollection',
    metadata: { generated: new Date().toISOString(), filters: filtersLabel, disclaimer: DISCLAIMER, fakeData: true },
    features: views.map(({ p, r }) => ({
      type: 'Feature',
      id: p.id,
      properties: {
        id: p.id, region: rm[p.regionId]?.name, commune: cm[p.communeId]?.name, superficie_ha: +p.areaHa.toFixed(3),
        culture: r.culture, culture_label: CULTURE_BY_ID[r.culture].label, confiance: +r.confidence.toFixed(3),
        statut: r.status, saison: r.seasonId, obs_debut: r.observedFrom, obs_fin: r.observedTo,
        date_traitement: r.processedAt, version_modele: r.modelVersion,
      },
      geometry: { type: 'Polygon', coordinates: [[...p.coords, p.coords[0]].map(([la, lo]) => [lo, la])] },
    })),
  });
}

export function openReport(opts: {
  title: string; perimeter: string; seasonId: string; filtersLabel: string;
  byCulture: Record<string, { count: number; area: number }>; total: { count: number; area: number };
  colors: Record<CultureId, string>; imageDates: string;
}) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const rows = CULTURES.filter((c) => opts.byCulture[c.id])
    .sort((a, b) => opts.byCulture[b.id].area - opts.byCulture[a.id].area)
    .map((c) => `<tr><td><span class="sw" style="background:${opts.colors[c.id]}"></span>${c.label}</td><td>${fmtInt(opts.byCulture[c.id].count)}</td><td>${fmtHa(opts.byCulture[c.id].area)}</td></tr>`)
    .join('');
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${opts.title}</title>
<style>
body{font-family:system-ui,sans-serif;color:#12262B;margin:32px;max-width:820px}
h1{font-size:22px;margin:0 0 4px} .meta{color:#4a5f64;font-size:13px;margin-bottom:20px}
table{border-collapse:collapse;width:100%;font-size:14px} th,td{border-bottom:1px solid #d5ddda;padding:8px 6px;text-align:left}
th{font-weight:600} .sw{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:8px;vertical-align:-1px}
.box{border:1px solid #d5ddda;border-radius:8px;padding:12px 14px;margin:18px 0;font-size:13px;background:#f5f8f7}
.map{height:240px;border:1px dashed #9aa3a1;border-radius:8px;display:grid;place-items:center;color:#6b7a7e;font-size:13px;margin:18px 0}
</style></head><body>
<h1>${opts.title}</h1>
<div class="meta">Périmètre : ${opts.perimeter} · Saison : ${SEASON_BY_ID[opts.seasonId]?.label} · Images : ${opts.imageDates}<br>Filtres : ${opts.filtersLabel}<br>Édité le ${fmtDate(new Date().toISOString())} — échelle indicative 1 : 250 000</div>
<div class="map">Emplacement de la carte (rendu cartographique fourni par l'API de rapport)</div>
<table><thead><tr><th>Classe</th><th>Parcelles</th><th>Superficie</th></tr></thead><tbody>${rows}
<tr><th>Total</th><th>${fmtInt(opts.total.count)}</th><th>${fmtHa(opts.total.area)}</th></tr></tbody></table>
<div class="box"><strong>Avertissement.</strong> ${DISCLAIMER} Données fictives de démonstration.</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  w.document.close();
  return true;
}
