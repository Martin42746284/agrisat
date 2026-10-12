import { RotateCcw } from 'lucide-react';
import { CULTURES } from '../data/constants';
import { useApp } from '../store/useApp';
import { useBase, useAggregate } from '../store/selectors';
import { fmtHa, fmtInt } from '../lib/format';

/**
 * Sélecteur de cultures : cliquer le nom filtre, cliquer la pastille change la couleur
 * (mise à jour en temps réel, sans relancer l'IA).
 */
export default function CultureRail({ layout = 'row' }: { layout?: 'row' | 'column' }) {
  const selected = useApp((s) => s.filters.cultures);
  const toggle = useApp((s) => s.toggleCulture);
  const colors = useApp((s) => s.colors);
  const setColor = useApp((s) => s.setColor);
  const resetColors = useApp((s) => s.resetColors);
  const agg = useAggregate(useBase());

  const present = CULTURES.filter((c) => agg.byCulture[c.id]);
  const absent = CULTURES.filter((c) => !agg.byCulture[c.id]);

  const chip = (id: (typeof CULTURES)[number]) => {
    const on = selected.includes(id.id);
    const b = agg.byCulture[id.id];
    return (
      <div key={id.id} className={`chip ${on ? 'chip--on' : ''} ${!b ? 'chip--zero' : ''}`} style={on ? { borderColor: colors[id.id] } : undefined}>
        <label className="chip__color" title={`Changer la couleur : ${id.label}`}>
          <input type="color" value={colors[id.id]} onChange={(e) => setColor(id.id, e.target.value)} aria-label={`Couleur ${id.label}`} />
          <span style={{ background: colors[id.id] }} />
        </label>
        <button className="chip__body" onClick={() => toggle(id.id)} aria-pressed={on}>
          <span className="chip__name">{id.label}</span>
          <span className="chip__num">{b ? `${fmtHa(b.area)} · ${fmtInt(b.count)}` : '—'}</span>
        </button>
      </div>
    );
  };

  return (
    <div className={`rail rail--${layout}`}>
      <div className="rail__list">
        {present.map(chip)}
        {layout === 'column' && absent.length > 0 && <div className="rail__sep">Sans parcelle dans le périmètre</div>}
        {layout === 'column' && absent.map(chip)}
      </div>
      <button className="link-btn" onClick={resetColors} title="Rétablir les couleurs par défaut"><RotateCcw size={13} /> Couleurs</button>
    </div>
  );
}
