import { useMemo } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { useApp } from '../store/useApp';
import { AREA_MAX, SEASONS, STATUS_LABEL } from '../data/constants';
import type { Status } from '../types';
import { bboxOf } from '../lib/geometry';
import CultureRail from './CultureRail';
import { fmtDate } from '../lib/format';

export default function FiltersPanel({ withCultures, floating, onClose }: { withCultures?: boolean; floating?: boolean; onClose?: () => void }) {
  const f = useApp((s) => s.filters);
  const set = useApp((s) => s.setFilters);
  const reset = useApp((s) => s.resetFilters);
  const regions = useApp((s) => s.regions);
  const communes = useApp((s) => s.communes);
  const flyTo = useApp((s) => s.flyTo);
  const zone = useApp((s) => s.zone);

  const communeOpts = useMemo(() => communes.filter((c) => !f.regionId || c.regionId === f.regionId), [communes, f.regionId]);
  const season = SEASONS.find((s) => s.id === f.seasonId);

  const onRegion = (id: string) => {
    set({ regionId: id || null, communeId: null });
    const r = regions.find((x) => x.id === id);
    if (r) flyTo({ bounds: bboxOf(r.outline) });
  };
  const onCommune = (id: string) => {
    set({ communeId: id || null });
    const c = communes.find((x) => x.id === id);
    if (c) flyTo({ bounds: bboxOf(c.outline) });
  };
  const toggleStatus = (s: Status) =>
    set({ statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] });

  return (
    <aside className={`filters ${floating ? 'filters--float glass' : ''}`} aria-label="Filtres">
      <div className="filters__head">
        <h2>Filtres</h2>
        <button className="link-btn" onClick={reset}><RotateCcw size={13} /> Réinitialiser</button>
        {floating && onClose && <button className="icon-btn" onClick={onClose} aria-label="Fermer les filtres"><X size={18} /></button>}
      </div>

      <section>
        <label className="field">
          <span>Saison agricole</span>
          <select value={f.seasonId} onChange={(e) => set({ seasonId: e.target.value })}>
            {SEASONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        {season?.note && <p className="hint">{season.note} — résultats provisoires jusqu'au {fmtDate(season.end)}.</p>}
      </section>

      <section>
        <label className="field">
          <span>Région</span>
          <select value={f.regionId ?? ''} onChange={(e) => onRegion(e.target.value)}>
            <option value="">Toutes les zones pilotes</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Commune</span>
          <select value={f.communeId ?? ''} onChange={(e) => onCommune(e.target.value)}>
            <option value="">Toutes</option>
            {communeOpts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.coverage === 'non_analysee' ? ' (non analysée)' : c.coverage === 'partielle' ? ' (partielle)' : ''}</option>
            ))}
          </select>
        </label>
        {zone && <p className="hint hint--accent">Zone dessinée active : les résultats s'y limitent.</p>}
      </section>

      {withCultures && (
        <section>
          <h3>Cultures</h3>
          <CultureRail layout="column" />
        </section>
      )}

      <section>
        <h3>Superficie</h3>
        <div className="range-row">
          <label className="field field--inline"><span>Min</span>
            <input type="number" min={0} max={f.areaMax} step={0.1} value={f.areaMin} onChange={(e) => set({ areaMin: Math.max(0, +e.target.value) })} />
          </label>
          <label className="field field--inline"><span>Max</span>
            <input type="number" min={f.areaMin} max={AREA_MAX} step={0.5} value={f.areaMax} onChange={(e) => set({ areaMax: Math.min(AREA_MAX, +e.target.value) })} />
          </label>
          <span className="unit">ha</span>
        </div>
        <input type="range" min={0} max={AREA_MAX} step={0.1} value={f.areaMax} onChange={(e) => set({ areaMax: Math.max(f.areaMin, +e.target.value) })} aria-label="Superficie maximale" />
        <p className="hint">{f.areaMax >= AREA_MAX ? `Sans plafond (≥ ${AREA_MAX} ha)` : `Jusqu'à ${f.areaMax} ha`}</p>
      </section>

      <section>
        <label className="field">
          <span>Confiance minimale : <b>{f.confMin} %</b></span>
          <input type="range" min={0} max={95} step={5} value={f.confMin} onChange={(e) => set({ confMin: +e.target.value })} />
        </label>
      </section>

      <section>
        <h3>Statut de validation</h3>
        <div className="checks">
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <label key={s} className="check">
              <input type="checkbox" checked={f.statuses.includes(s)} onChange={() => toggleStatus(s)} />
              <span>{STATUS_LABEL[s]}</span>
            </label>
          ))}
        </div>
        {f.statuses.length === 0 && <p className="hint">Aucun filtre : tous les statuts.</p>}
      </section>

      <section>
        <h3>Date d'analyse</h3>
        <div className="range-row">
          <label className="field field--inline"><span>Du</span>
            <input type="date" value={f.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} />
          </label>
          <label className="field field--inline"><span>Au</span>
            <input type="date" value={f.dateTo} onChange={(e) => set({ dateTo: e.target.value })} />
          </label>
        </div>
      </section>
    </aside>
  );
}
