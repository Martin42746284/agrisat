import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { useApp } from '../store/useApp';
import { useAggregate, useFinal } from '../store/selectors';
import { CULTURE_BY_ID } from '../data/constants';
import { fmtDate, fmtHa, fmtInt, fmtPct } from '../lib/format';
import FiltersPanel from '../components/FiltersPanel';
import ExportMenu from '../components/ExportMenu';
import { ConfidenceBar, Empty, StatusBadge, Swatch } from '../components/ui';

type SortKey = 'id' | 'commune' | 'area' | 'culture' | 'conf' | 'status' | 'date';
const PAGE = 25;

export default function Parcels() {
  const final = useFinal();
  const agg = useAggregate(final);
  const colors = useApp((s) => s.colors);
  const threshold = useApp((s) => s.threshold);
  const communes = useApp((s) => s.communes);
  const select = useApp((s) => s.select);
  const selectedId = useApp((s) => s.selectedId);
  const flyTo = useApp((s) => s.flyTo);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'area', dir: -1 });
  const [page, setPage] = useState(0);

  const cname = useMemo(() => Object.fromEntries(communes.map((c) => [c.id, c.name])), [communes]);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n ? final.filter((v) => v.p.id.toLowerCase().includes(n)) : final.slice();
    const get = (v: (typeof final)[number]) => {
      switch (sort.k) {
        case 'id': return v.p.id;
        case 'commune': return cname[v.p.communeId];
        case 'area': return v.p.areaHa;
        case 'culture': return CULTURE_BY_ID[v.r.culture].label;
        case 'conf': return v.r.confidence;
        case 'status': return v.r.status;
        case 'date': return v.r.processedAt;
      }
    };
    list.sort((a, b) => { const x = get(a), y = get(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
    return list;
  }, [final, q, sort, cname]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = rows.slice(cur * PAGE, cur * PAGE + PAGE);

  const th = (k: SortKey, label: string, num = false) => (
    <th className={num ? 'num' : ''} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="th-btn" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}{sort.k === k && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="page page--cols">
      <FiltersPanel withCultures />
      <div className="content">
        <div className="content__head">
          <div><h1>Parcelles</h1><p className="muted">{fmtInt(agg.count)} parcelles · {fmtHa(agg.area)} avec les filtres actifs.</p></div>
          <div className="row">
            <label className="search"><Search size={14} /><input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Identifiant (ex. PC-ATB)" aria-label="Rechercher un identifiant" /></label>
            <ExportMenu />
          </div>
        </div>
        {rows.length === 0 ? <Empty title="Aucune parcelle ne correspond." hint="Modifiez les filtres ou l'identifiant recherché." /> : (
          <>
            <div className="tablewrap tablewrap--page">
              <table className="table table--rows">
                <thead><tr>
                  {th('id', 'Identifiant')}{th('commune', 'Commune')}{th('area', 'Superficie', true)}{th('culture', 'Culture')}{th('conf', 'Confiance')}{th('status', 'Statut')}{th('date', 'Traitée le')}<th />
                </tr></thead>
                <tbody>
                  {slice.map(({ p, r }) => (
                    <tr key={p.id} className={p.id === selectedId ? 'is-current' : ''} onClick={() => select(p.id)} tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && select(p.id)}>
                      <td><b>{p.id}</b></td>
                      <td>{cname[p.communeId]}</td>
                      <td className="num">{fmtHa(p.areaHa)}</td>
                      <td><Swatch color={colors[r.culture]} /> {CULTURE_BY_ID[r.culture].label}</td>
                      <td className="conf-cell"><ConfidenceBar value={r.confidence} threshold={threshold} /><span>{fmtPct(r.confidence)}</span></td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{fmtDate(r.processedAt)}</td>
                      <td><button className="link-btn" onClick={(e) => { e.stopPropagation(); select(p.id); flyTo({ center: p.centroid, zoom: 16 }); }}>Voir sur la carte</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span>{cur * PAGE + 1}–{Math.min(rows.length, (cur + 1) * PAGE)} sur {fmtInt(rows.length)}</span>
              <button className="btn btn--sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Précédent</button>
              <span>Page {cur + 1} / {pages}</span>
              <button className="btn btn--sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Suivant</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
