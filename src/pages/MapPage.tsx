import { useMemo, useState } from 'react';
import { useApp } from '../store/useApp';
import { useAggregate, useBase, useFinal } from '../store/selectors';
import { CULTURE_BY_ID, ROLES, SEASON_BY_ID } from '../data/constants';
import { fmtDate, fmtHa, fmtInt } from '../lib/format';
import { bboxOf } from '../lib/geometry';
import type { DisplayMode } from '../types';
import FiltersPanel from '../components/FiltersPanel';
import CultureRail from '../components/CultureRail';
import MapView from '../components/MapView';
import MapToolbar from '../components/MapToolbar';
import Legend from '../components/Legend';
import NewAnalysisModal from '../components/NewAnalysisModal';
import { Swatch } from '../components/ui';

const MODES: { id: DisplayMode; label: string; hint: string }[] = [
  { id: 'general', label: 'Vue générale', hint: 'Toutes les cultures, chacune dans sa couleur' },
  { id: 'filtre', label: 'Vue filtrée', hint: 'Seules les cultures choisies sont mises en avant' },
  { id: 'comparatif', label: 'Vue comparative', hint: 'Une couleur par culture choisie, le reste en fond grisé' },
];

export default function MapPage() {
  const [analysis, setAnalysis] = useState(false);
  const f = useApp((s) => s.filters);
  const set = useApp((s) => s.setFilters);
  const colors = useApp((s) => s.colors);
  const user = useApp((s) => s.user)!;
  const communes = useApp((s) => s.communes);
  const regions = useApp((s) => s.regions);
  const flyTo = useApp((s) => s.flyTo);
  const base = useBase();
  const final = useFinal();
  const aggBase = useAggregate(base);
  const aggFinal = useAggregate(final);
  const baseIds = useMemo(() => new Set(base.map((v) => v.p.id)), [base]);
  const season = SEASON_BY_ID[f.seasonId];
  const can = ROLES[user.role].can;

  const imageRange = useMemo(() => {
    const d = communes.filter((c) => c.imageDate && (!f.regionId || c.regionId === f.regionId)).map((c) => c.imageDate!).sort();
    return d.length ? `${fmtDate(d[0])} → ${fmtDate(d[d.length - 1])}` : '—';
  }, [communes, f.regionId]);

  const sel = f.mode !== 'general' ? f.cultures : [];
  const cmp = f.mode === 'comparatif' && sel.length > 0;

  const filtersOpen = useApp((s) => s.filtersOpen);
  const setFiltersOpen = useApp((s) => s.setFiltersOpen);

  return (
    <div className="page page--map">
      <MapView baseIds={baseIds} />

      <section className="parambar glass" aria-label="Paramètres d'affichage">
        <div className="parambar__chips"><CultureRail layout="row" /></div>
        <div className="parambar__ctrl">
          <div className="seg" role="group" aria-label="Mode d'affichage">
            {MODES.map((m) => (
              <button key={m.id} className={f.mode === m.id ? 'is-on' : ''} onClick={() => set({ mode: m.id })} title={m.hint} aria-pressed={f.mode === m.id}>{m.label}</button>
            ))}
          </div>
          {f.mode === 'filtre' && sel.length > 0 && (
            <div className="seg seg--sm" role="group" aria-label="Autres parcelles">
              <button className={f.othersStyle === 'grise' ? 'is-on' : ''} onClick={() => set({ othersStyle: 'grise' })}>Griser</button>
              <button className={f.othersStyle === 'masque' ? 'is-on' : ''} onClick={() => set({ othersStyle: 'masque' })}>Masquer</button>
            </div>
          )}
          <div className="stats" aria-live="polite">
            <span><b>{fmtInt(aggFinal.count)}</b> parcelles</span>
            <span><b>{fmtHa(aggFinal.area)}</b></span>
            <span className={aggFinal.uncertain ? 'stats__warn' : ''}><b>{fmtInt(aggFinal.uncertain)}</b> incertaines</span>
            {sel.length > 0 && <span className="muted">sur {fmtInt(aggBase.count)}</span>}
            {sel.length > 0 && <button className="link-btn" onClick={() => set({ cultures: [], mode: 'general' })}>Effacer</button>}
          </div>
        </div>
        {cmp && (
          <div className="compare">
            {sel.map((id) => {
              const b = aggBase.byCulture[id];
              const pct = aggBase.area ? ((b?.area ?? 0) / aggBase.area) * 100 : 0;
              return (
                <div key={id} className="compare__item">
                  <span><Swatch color={colors[id]} /> {CULTURE_BY_ID[id].label}</span>
                  <div className="compare__bar"><i style={{ width: `${pct}%`, background: colors[id] }} /></div>
                  <em>{fmtHa(b?.area ?? 0)} · {pct.toFixed(1).replace('.', ',')} %</em>
                </div>
              );
            })}
            {sel.length < 2 && <span className="hint">Ajoutez une deuxième culture pour comparer.</span>}
          </div>
        )}
      </section>

      <MapToolbar canLaunch={can.launch} onAnalyze={() => setAnalysis(true)} />
      <Legend />
      {filtersOpen && <FiltersPanel floating onClose={() => setFiltersOpen(false)} />}

      {base.length === 0 && (
        <div className="map-hint glass">
          <b>Aucune parcelle visible avec ces filtres.</b>
          <span>Assouplissez les filtres ou allez sur une zone pilote.</span>
          <div>{regions.map((r) => <button key={r.id} className="btn btn--sm" onClick={() => flyTo({ bounds: bboxOf(r.outline) })}>{r.name}</button>)}</div>
        </div>
      )}

      {analysis && <NewAnalysisModal onClose={() => setAnalysis(false)} withZone />}
    </div>
  );
}
