import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, Eraser, Home, Layers, PenTool, Search, Undo2, X, ScanSearch, Wand2 } from 'lucide-react';
import { useApp } from '../store/useApp';
import { bboxOf, centroidOf, M_PER_DEG_LAT, mPerDegLng } from '../lib/geometry';
import { normalize } from '../lib/format';
import { api } from '../api/services';
import { maltoVhrToFrontend, type MaltoVhrFeature } from '../api/maltoAdapter';

const NATIONAL: [[number, number], [number, number]] = [[-25.8, 43.0], [-11.8, 50.7]];

export default function MapToolbar({ onAnalyze, canLaunch }: { onAnalyze: () => void; canLaunch: boolean }) {
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const regions = useApp((s) => s.regions);
  const communes = useApp((s) => s.communes);
  const flyTo = useApp((s) => s.flyTo);
  const basemap = useApp((s) => s.basemap);
  const setBasemap = useApp((s) => s.setBasemap);
  const showCoverage = useApp((s) => s.showCoverage);
  const setShowCoverage = useApp((s) => s.setShowCoverage);
  const drawing = useApp((s) => s.drawing);
  const draft = useApp((s) => s.draft);
  const zone = useApp((s) => s.zone);
  const { startDraw, undoDraft, finishDraw, cancelDraw, setZone } = useApp.getState();
  const traceInfo = useApp((s) => s.traceInfo);
  const addTracedParcels = useApp((s) => s.addTracedParcels);
  const toast = useApp((s) => s.toast);
  const [pending, setPending] = useState(false);
  const [traceErr, setTraceErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Annulation au démontage (changement de page) : pas de mise à jour d'état après.
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Traçage automatique des contours (backend AGRISAT → service JECAM / Delineate Anything).
   * Rayon plafonné à 1 000 m, calcul long : requête annulable, garde anti double-clic.
   */
  const trace = async () => {
    if (!zone || pending) return;
    abortRef.current?.abort(); // annule une trace précédente éventuelle
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPending(true);
    setTraceErr(null);
    try {
      const center = centroidOf(zone);
      const kx = mPerDegLng(center[0]);
      let maxM = 0;
      for (const [la, lo] of zone) {
        const d = Math.hypot((la - center[0]) * M_PER_DEG_LAT, (lo - center[1]) * kx);
        if (d > maxM) maxM = d;
      }
      const radius_m = Math.min(1000, Math.max(200, Math.round(maxM * 1.2)));
      const res = await api.zoneParcels(
        { latitude: center[0], longitude: center[1], radius_m, min_confidence: 0, min_area_ha: 0, mode: 'simple' },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      const features = (res.geojson?.features ?? []) as MaltoVhrFeature[];
      const traced = maltoVhrToFrontend(features, { regions, communes });
      const added = addTracedParcels(traced, {
        count: traced.length,
        added: 0, // recalculé par l'action (contours réellement nouveaux)
        attribution: res.attribution,
        warnings: res.warnings ?? [],
        at: new Date().toISOString(),
      });
      toast(
        traced.length === 0
          ? 'Aucune parcelle tracée dans ce rayon (image ou service de tracage indisponible).'
          : added === 0
            ? `${traced.length} contours tracés — tous déjà présents, aucune nouvelle parcelle. ` +
              'Le service de tracage renvoie actuellement sa base précalculée quel que soit le lieu ; ' +
              'une remesure est nécessaire côté backend (service VHR) pour obtenir de nouveaux contours.'
            : `${added} nouvelle(s) parcelle(s) ajoutée(s) — ${traced.length} contours tracés au total (IA indicatifs).`,
        traced.length === 0 ? 'warn' : 'ok',
      );
    } catch (err) {
      if (!ctrl.signal.aborted) setTraceErr(err instanceof Error ? err.message : String(err));
    } finally {
      if (!ctrl.signal.aborted) setPending(false);
    }
  };

  const results = useMemo(() => {
    const n = normalize(q.trim());
    if (!n) return [];
    return [
      ...regions.map((r) => ({ key: r.id, label: r.name, sub: 'Région', bounds: bboxOf(r.outline) })),
      ...communes.map((c) => ({ key: c.id, label: c.name, sub: `Commune · ${regions.find((r) => r.id === c.regionId)?.name}`, bounds: bboxOf(c.outline) })),
    ].filter((x) => normalize(x.label).includes(n)).slice(0, 6);
  }, [q, regions, communes]);

  useEffect(() => {
    if (!drawing) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter') useApp.getState().finishDraw();
      if (e.key === 'Escape') useApp.getState().cancelDraw();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [drawing]);

  return (
    <>
      <div className="maptools">
        <div className="toolgroup glass" role="group" aria-label="Outils de carte">
          <div className="searchwrap">
            <button className={`tool ${searchOpen ? 'tool--on' : ''}`} data-tip="Rechercher un lieu" aria-label="Rechercher un lieu" onClick={() => setSearchOpen(!searchOpen)}><Search size={18} /></button>
            {searchOpen && (
              <div className="searchpop glass">
                <Search size={15} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex. Antsirabe, Itasy…" aria-label="Rechercher un lieu" />
                {q && (
                  <ul className="searchpop__results">
                    {results.length === 0 && <li className="searchpop__none">Aucun lieu dans les zones pilotes.</li>}
                    {results.map((r) => (
                      <li key={r.key}><button onClick={() => { flyTo({ bounds: r.bounds }); setQ(''); setSearchOpen(false); }}><b>{r.label}</b><span>{r.sub}</span></button></li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button className="tool" data-tip="Vue nationale" aria-label="Retour à l'emprise nationale" onClick={() => flyTo({ bounds: NATIONAL })}><Home size={18} /></button>
          <button className={`tool ${basemap === 'satellite' ? 'tool--on' : ''}`} data-tip={basemap === 'plan' ? 'Fond satellite' : 'Fond plan'} aria-label="Basculer plan / satellite" onClick={() => setBasemap(basemap === 'plan' ? 'satellite' : 'plan')}><Layers size={18} /></button>
          <button className={`tool ${showCoverage ? 'tool--on' : ''}`} data-tip="Couverture des analyses" aria-label="Afficher la couverture des analyses" onClick={() => setShowCoverage(!showCoverage)}><Crosshair size={18} /></button>
          {!drawing && !zone && <button className="tool" data-tip="Dessiner une zone" aria-label="Dessiner une zone d'étude" onClick={startDraw}><PenTool size={18} /></button>}
        </div>

        {zone && !drawing && (
          <div className="zonecard glass">
            <b>Zone d'étude</b>
            <button className="btn btn--sm" onClick={startDraw}><PenTool size={13} /> Redessiner</button>
            {canLaunch && <button className="btn btn--sm btn--primary" onClick={onAnalyze}><ScanSearch size={13} /> Analyser</button>}
            <button className="btn btn--sm" onClick={trace} disabled={pending}
              title="Tracer automatiquement les contours des parcelles (modèle JECAM via le backend)">
              <Wand2 size={13} /> {pending ? 'Tracé en cours…' : 'Tracer les contours'}
            </button>
            <button className="btn btn--sm" onClick={() => setZone(null)}><Eraser size={13} /> Supprimer</button>
            {pending && <span className="hint">Tracé IA en cours — plusieurs dizaines de secondes possibles…</span>}
            {traceErr && <p className="note note--danger">{traceErr}</p>}
            {traceInfo && !pending && (
              <div>
                <span className="hint">
                  {traceInfo.count} contour(s) tracé(s) — {traceInfo.added} nouvelle(s) parcelle(s) ajoutée(s).
                  Contours IA indicatifs, confiance variable.
                </span>
                {traceInfo.attribution && <span className="hint"> {traceInfo.attribution}</span>}
                {traceInfo.warnings.map((w) => <p key={w} className="note note--warn">{w}</p>)}
              </div>
            )}
          </div>
        )}
      </div>

      {drawing && (
        <div className="drawbar glass" role="status">
          <span>Cliquez sur la carte pour placer les sommets ({draft.length} placé{draft.length > 1 ? 's' : ''}).</span>
          <button className="btn btn--sm" onClick={undoDraft} disabled={!draft.length}><Undo2 size={13} /> Retirer</button>
          <button className="btn btn--sm btn--primary" onClick={finishDraw}><Check size={13} /> Terminer</button>
          <button className="btn btn--sm" onClick={cancelDraw}><X size={13} /> Annuler</button>
        </div>
      )}
    </>
  );
}
