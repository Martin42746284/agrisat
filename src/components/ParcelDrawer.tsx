import { useMemo, useState } from 'react';
import { X, Pencil, ClipboardCheck, Flag, Trash2, Merge, Split, Check, Move } from 'lucide-react';
import { useApp } from '../store/useApp';
import { CULTURES, CULTURE_BY_ID, ROLES, SEASONS, SEASON_BY_ID } from '../data/constants';
import { fmtDate, fmtHa, fmtPct } from '../lib/format';
import { isUncertain } from '../lib/filter';
import { ringAreaHa } from '../lib/geometry';
import { api } from '../api/services';
import type { CultureId, Parcel } from '../types';
import { ConfidenceBar, Modal, StatusBadge, Swatch } from './ui';

function Shape({ p, color }: { p: Parcel; color: string }) {
  const lats = p.coords.map((c) => c[0]), lngs = p.coords.map((c) => c[1]);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lngs), maxLo = Math.max(...lngs);
  const k = Math.cos((p.centroid[0] * Math.PI) / 180);
  const w = (maxLo - minLo) * k, h = maxLa - minLa, m = Math.max(w, h) * 0.18;
  const pts = p.coords.map(([la, lo]) => `${(lo - minLo) * k + m},${maxLa - la + m}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w + 2 * m} ${h + 2 * m}`} className="shape" role="img" aria-label="Géométrie de la parcelle">
      <polygon points={pts} fill={color} fillOpacity={0.6} stroke="#12262B" strokeWidth={Math.max(w, h) * 0.012} strokeLinejoin="round" />
    </svg>
  );
}

export default function ParcelDrawer() {
  const id = useApp((s) => s.selectedId);
  const parcels = useApp((s) => s.parcels);
  const seasonId = useApp((s) => s.filters.seasonId);
  const colors = useApp((s) => s.colors);
  const threshold = useApp((s) => s.threshold);
  const user = useApp((s) => s.user);
  const communes = useApp((s) => s.communes);
  const regions = useApp((s) => s.regions);
  const select = useApp((s) => s.select);
  const editingParcelId = useApp((s) => s.editingParcelId);
  const editingCoords = useApp((s) => s.editingCoords);
  const { startEditParcel, cancelEditParcel, saveEditParcel } = useApp.getState();
  const [modal, setModal] = useState<null | 'correct' | 'observe' | 'report' | 'reject'>(null);

  const p = useMemo(() => parcels.find((x) => x.id === id), [parcels, id]);
  if (!p) return null;
  const editing = editingParcelId === p.id && !!editingCoords;
  const r = p.results[seasonId];
  const can = user ? ROLES[user.role].can : null;
  const commune = communes.find((c) => c.id === p.communeId);
  const region = regions.find((x) => x.id === p.regionId);
  const probs = r ? Object.entries(r.probs).sort((a, b) => b[1]! - a[1]!).slice(0, 4) as [CultureId, number][] : [];
  const history = SEASONS.filter((s) => p.results[s.id]);

  return (
    <aside className="drawer" aria-label="Fiche de la parcelle">
      <header className="drawer__head">
        <div>
          <h2>{p.id}</h2>
          <p>{commune?.name} · {region?.name}</p>
        </div>
        <button className="icon-btn" onClick={() => select(null)} aria-label="Fermer la fiche"><X size={18} /></button>
      </header>

      {editing && editingCoords && (
        <div className="editbar" role="region" aria-label="Mode édition du contour">
          <div className="editbar__head">
            <b><Move size={14} /> Édition du contour</b>
            <span className="hint">{editingCoords.length} sommets</span>
          </div>
          <p className="hint">Déplacez les points blancs du polygone sur la carte pour ajuster la parcelle, puis validez.</p>
          <dl className="kv">
            <dt>Superficie après modification</dt>
            <dd className="big">{fmtHa(ringAreaHa(editingCoords))}</dd>
          </dl>
          <div className="actions">
            <button className="btn btn--primary" onClick={saveEditParcel}><Check size={14} /> Valider le contour</button>
            <button className="btn" onClick={cancelEditParcel}><X size={14} /> Annuler</button>
          </div>
        </div>
      )}

      {!r ? (
        <p className="drawer__empty">Aucun résultat pour la saison « {SEASON_BY_ID[seasonId]?.short} ». Choisissez une autre saison.</p>
      ) : (
        <div className="drawer__body">
          <div className="drawer__top">
            <Shape p={p} color={colors[r.culture]} />
            <dl className="kv">
              <dt>Superficie estimée</dt><dd className="big">{fmtHa(p.areaHa)}</dd>
              <dt>Statut</dt><dd><StatusBadge status={r.status} /></dd>
            </dl>
          </div>

          <section>
            <h3>Culture estimée</h3>
            <div className="culture-line">
              <Swatch color={colors[r.culture]} size={14} />
              <strong>{CULTURE_BY_ID[r.culture].label}</strong>
              <span className="muted">confiance {fmtPct(r.confidence)}</span>
            </div>
            <ConfidenceBar value={r.confidence} threshold={threshold} />
            {(isUncertain(r, threshold) || r.culture === 'inconnue') && (
              <p className="note note--warn">Résultat incertain : à interpréter avec prudence et à confirmer sur le terrain.</p>
            )}
            <h4>Probabilités par classe</h4>
            <ul className="probs">
              {probs.map(([c, v]) => (
                <li key={c}>
                  <span><Swatch color={colors[c]} size={10} /> {CULTURE_BY_ID[c].label}</span>
                  <div className="probs__bar"><i style={{ width: `${v * 100}%`, background: colors[c] }} /></div>
                  <em>{fmtPct(v)}</em>
                </li>
              ))}
            </ul>
            <p className="hint">Scores du modèle, non calibrés : ce ne sont pas des probabilités garanties.</p>
          </section>

          <section>
            <h3>Source de l'analyse</h3>
            <dl className="kv kv--wide">
              <dt>Saison</dt><dd>{SEASON_BY_ID[r.seasonId]?.label}</dd>
              <dt>Images utilisées</dt><dd>{fmtDate(r.observedFrom)} → {fmtDate(r.observedTo)}</dd>
              <dt>Traitée le</dt><dd>{fmtDate(r.processedAt)}</dd>
              <dt>Modèle</dt><dd>{r.modelVersion}</dd>
              <dt>Analyse</dt><dd>{r.analysisId}</dd>
              <dt>Détection du contour</dt><dd>{fmtPct(p.detectionConfidence)}</dd>
            </dl>
          </section>

          <section>
            <h3>Historique</h3>
            <table className="mini">
              <tbody>
                {history.map((s) => {
                  const h = p.results[s.id];
                  return (
                    <tr key={s.id} className={s.id === seasonId ? 'is-current' : ''}>
                      <td>{s.short}</td>
                      <td><Swatch color={colors[h.culture]} size={10} /> {CULTURE_BY_ID[h.culture].label}</td>
                      <td>{fmtPct(h.confidence)}</td>
                      <td><StatusBadge status={h.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {p.corrections.length > 0 && (
              <ul className="timeline">
                {p.corrections.map((c, i) => (
                  <li key={i}>
                    <b>{c.kind === 'observation' ? 'Observation terrain' : 'Correction'}</b> · {SEASON_BY_ID[c.seasonId]?.short}
                    <span>{CULTURE_BY_ID[c.from].label} → {CULTURE_BY_ID[c.to].label} · {c.by} · {fmtDate(c.at)}</span>
                    <span>{c.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="actions">
            {can?.correct && !editing && <button className="btn" onClick={() => startEditParcel(p.id)} title="Ou double-cliquez la parcelle sur la carte"><Move size={14} /> Modifier le contour</button>}
            {can?.correct && <button className="btn btn--primary" onClick={() => setModal('correct')}><Pencil size={14} /> Corriger la classe</button>}
            {can?.observe && <button className="btn" onClick={() => setModal('observe')}><ClipboardCheck size={14} /> Saisir une observation</button>}
            <button className="btn" onClick={() => setModal('report')}><Flag size={14} /> Signaler un problème</button>
            {can?.correct && (
              <>
                <button className="btn" disabled title="Fusion de polygones — sera reliée à PostGIS (ST_Union)"><Merge size={14} /> Fusionner</button>
                <button className="btn" disabled title="Scission de polygone — sera reliée à PostGIS (ST_Split)"><Split size={14} /> Scinder</button>
                <button className="btn btn--danger" onClick={() => setModal('reject')}><Trash2 size={14} /> Rejeter le polygone</button>
              </>
            )}
          </section>
          <p className="legal">Contour détecté par IA — ce n'est pas une limite foncière officielle.</p>
        </div>
      )}

      {modal && r && <ParcelModal kind={modal} parcel={p} current={r.culture} onClose={() => setModal(null)} />}
    </aside>
  );
}

function ParcelModal({ kind, parcel, current, onClose }: { kind: 'correct' | 'observe' | 'report' | 'reject'; parcel: Parcel; current: CultureId; onClose: () => void }) {
  const [culture, setCulture] = useState<CultureId>(current);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { correctParcel, rejectParcel, toast, logAudit } = useApp.getState();

  const save = async () => {
    if (kind === 'correct' || kind === 'observe') {
      if (!note.trim()) { toast('Ajoutez une note pour justifier la modification.', 'warn'); return; }
      correctParcel(parcel.id, culture, note.trim(), kind === 'observe' ? 'observation' : 'correction');
      toast(kind === 'observe' ? 'Observation enregistrée.' : 'Classe corrigée.', 'ok');
    } else if (kind === 'reject') {
      rejectParcel(parcel.id);
      toast('Polygone rejeté.', 'ok');
    } else {
      setBusy(true);
      await api.reportParcel(parcel.id, note);
      logAudit('Signalement', `Parcelle ${parcel.id}`);
      toast('Signalement transmis aux analystes.', 'ok');
    }
    onClose();
  };

  const titles = { correct: 'Corriger la classe', observe: 'Saisir une observation de terrain', report: 'Signaler un problème', reject: 'Rejeter ce polygone' };
  return (
    <Modal title={titles[kind]} onClose={onClose}
      footer={<><button className="btn btn--ghost" onClick={onClose}>Annuler</button>
        <button className={`btn ${kind === 'reject' ? 'btn--danger' : 'btn--primary'}`} onClick={save} disabled={busy}>
          {kind === 'reject' ? 'Rejeter' : kind === 'report' ? 'Envoyer' : 'Enregistrer'}</button></>}>
      <p className="muted">{parcel.id}</p>
      {kind === 'reject' ? (
        <p>Le polygone sera retiré des résultats et l'action sera consignée au journal d'audit. Confirmer ?</p>
      ) : (
        <>
          {(kind === 'correct' || kind === 'observe') && (
            <label className="field">
              <span>{kind === 'observe' ? 'Culture observée' : 'Nouvelle classe'}</span>
              <select value={culture} onChange={(e) => setCulture(e.target.value as CultureId)}>
                {CULTURES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span>{kind === 'report' ? 'Description' : 'Note'}</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'report' ? 'Ex. contour fusionné avec la parcelle voisine' : 'Source et date de la vérification'} />
          </label>
        </>
      )}
    </Modal>
  );
}
