import { useEffect, useMemo, useState } from 'react';
import { Check, Crosshair, Eraser, Home, Layers, PenTool, Search, Undo2, X, ScanSearch } from 'lucide-react';
import { useApp } from '../store/useApp';
import { bboxOf } from '../lib/geometry';
import { normalize } from '../lib/format';

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
            <button className="btn btn--sm" onClick={() => setZone(null)}><Eraser size={13} /> Supprimer</button>
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
