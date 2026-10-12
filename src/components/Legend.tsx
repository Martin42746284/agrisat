import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CULTURES } from '../data/constants';
import { useApp } from '../store/useApp';
import { useBase, useAggregate } from '../store/selectors';
import { fmtHa } from '../lib/format';
import { Swatch } from './ui';

export default function Legend() {
  const [open, setOpen] = useState(true);
  const f = useApp((s) => s.filters);
  const colors = useApp((s) => s.colors);
  const threshold = useApp((s) => s.threshold);
  const showCoverage = useApp((s) => s.showCoverage);
  const agg = useAggregate(useBase());

  const hasSel = f.mode !== 'general' && f.cultures.length > 0;
  const rows = CULTURES.filter((c) => agg.byCulture[c.id] && (!hasSel || f.cultures.includes(c.id)));

  return (
    <div className="legend">
      <button className="legend__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Légende</span>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {open && (
        <div className="legend__body">
          <ul className="legend__list">
            {rows.map((c) => (
              <li key={c.id}><Swatch color={colors[c.id]} /><span>{c.label}</span><em>{fmtHa(agg.byCulture[c.id].area)}</em></li>
            ))}
            {hasSel && <li><i className="legend__dim" /><span>{f.mode === 'filtre' && f.othersStyle === 'masque' ? 'Autres : masquées' : 'Autres classes (grisées)'}</span></li>}
          </ul>
          <ul className="legend__list legend__list--lines">
            <li><i className="ln ln--dash" /><span>Incertain (confiance &lt; {Math.round(threshold * 100)} %) ou non classé</span></li>
            <li><i className="ln ln--dot" /><span>Obsolète (ancien modèle)</span></li>
            <li><i className="ln ln--bold" /><span>Vérifié sur le terrain ou corrigé</span></li>
            {showCoverage && <li><i className="ln ln--gap" /><span>Commune sans donnée / couverture partielle</span></li>}
          </ul>
        </div>
      )}
    </div>
  );
}
