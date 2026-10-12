import { useRef, useState, useEffect } from 'react';
import { Download, FileText, FileJson, FileSpreadsheet, FileType } from 'lucide-react';
import { useApp } from '../store/useApp';
import { useAggregate, useFinal } from '../store/selectors';
import { api } from '../api/services';
import { download, openReport, toCSV, toGeoJSON } from '../lib/exporters';
import { SEASON_BY_ID, ROLES, CULTURE_BY_ID } from '../data/constants';

export default function ExportMenu({ glass }: { glass?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const user = useApp((s) => s.user);
  const f = useApp((s) => s.filters);
  const regions = useApp((s) => s.regions);
  const communes = useApp((s) => s.communes);
  const colors = useApp((s) => s.colors);
  const zone = useApp((s) => s.zone);
  const { toast, logAudit } = useApp.getState();
  const views = useFinal();
  const agg = useAggregate(views);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!user || !ROLES[user.role].can.export) return null;

  const label = [
    SEASON_BY_ID[f.seasonId]?.short,
    f.regionId ? regions.find((r) => r.id === f.regionId)?.name : 'Toutes zones',
    f.communeId ? communes.find((c) => c.id === f.communeId)?.name : null,
    f.mode !== 'general' && f.cultures.length ? f.cultures.map((c) => CULTURE_BY_ID[c].label).join(' + ') : null,
    zone ? 'zone dessinée' : null,
  ].filter(Boolean).join(' · ');

  const run = async (kind: 'csv' | 'geojson' | 'pdf') => {
    if (!views.length) { toast('Aucune parcelle à exporter avec les filtres actifs.', 'warn'); return; }
    setBusy(kind); setOpen(false);
    const job = await api.createExport(kind);
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'csv') download(`parcelles_${stamp}.csv`, 'text/csv;charset=utf-8', toCSV(views, { communes, regions }));
    if (kind === 'geojson') download(`parcelles_${stamp}.geojson`, 'application/geo+json', toGeoJSON(views, { communes, regions }, label));
    if (kind === 'pdf') {
      const dates = communes.filter((c) => c.imageDate).map((c) => c.imageDate!).sort();
      openReport({
        title: 'Rapport cartographique — parcelles agricoles', perimeter: label, seasonId: f.seasonId, filtersLabel: label,
        byCulture: agg.byCulture, total: { count: agg.count, area: agg.area }, colors, imageDates: `${dates[0]} → ${dates[dates.length - 1]}`,
      });
    }
    logAudit(`Export ${kind.toUpperCase()}`, label);
    toast(`Export ${job.id} prêt (${views.length} parcelles).`, 'ok');
    setBusy(null);
  };

  return (
    <div className="menu" ref={ref}>
      <button className={`btn ${glass ? 'fab glass' : ''}`} onClick={() => setOpen(!open)} disabled={!!busy} aria-haspopup="menu" aria-expanded={open}>
        <Download size={14} /> {busy ? 'Préparation…' : 'Exporter'}
      </button>
      {open && (
        <div className="menu__list glass" role="menu">
          <button role="menuitem" onClick={() => run('csv')}><FileSpreadsheet size={15} /> Attributs · CSV</button>
          <button role="menuitem" onClick={() => run('geojson')}><FileJson size={15} /> Géométries · GeoJSON</button>
          <button role="menuitem" onClick={() => run('pdf')}><FileText size={15} /> Rapport cartographique · PDF</button>
          <button role="menuitem" disabled><FileType size={15} /> GeoPackage / Shapefile (via API)</button>
        </div>
      )}
    </div>
  );
}
