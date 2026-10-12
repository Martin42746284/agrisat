import { useState } from 'react';
import { Plus, RotateCcw, Check, CircleDot, Circle } from 'lucide-react';
import { useApp } from '../store/useApp';
import { PIPELINE_STEPS, ROLES, SEASON_BY_ID } from '../data/constants';
import { fmtDate, fmtHa, fmtInt } from '../lib/format';
import { AnalysisBadge, Modal } from '../components/ui';
import NewAnalysisModal from '../components/NewAnalysisModal';

export default function Analyses() {
  const analyses = useApp((s) => s.analyses);
  const user = useApp((s) => s.user)!;
  const relaunch = useApp((s) => s.relaunchAnalysis);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const can = ROLES[user.role].can;
  const current = analyses.find((a) => a.id === open);

  const counts = analyses.reduce<Record<string, number>>((m, a) => ((m[a.status] = (m[a.status] ?? 0) + 1), m), {});

  return (
    <div className="page page--single">
      <div className="content content--wide">
        <div className="content__head">
          <div>
            <h1>Analyses</h1>
            <p className="muted">{counts.en_cours ?? 0} en cours · {counts.en_attente ?? 0} en attente · {counts.echec ?? 0} en échec</p>
          </div>
          {can.launch && <button className="btn btn--primary" onClick={() => setCreating(true)}><Plus size={14} /> Nouvelle analyse</button>}
        </div>

        <div className="tablewrap tablewrap--page">
          <table className="table table--rows">
            <thead><tr><th>Analyse</th><th>Périmètre</th><th>Saison</th><th>Statut</th><th>Avancement</th><th>Créée par</th><th>Date</th><th /></tr></thead>
            <tbody>
              {analyses.map((a) => (
                <tr key={a.id} onClick={() => setOpen(a.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(a.id)}>
                  <td><b>{a.id}</b>{a.cached && <span className="tag">cache</span>}</td>
                  <td>{a.zoneLabel}</td>
                  <td>{SEASON_BY_ID[a.seasonId]?.short}</td>
                  <td><AnalysisBadge status={a.status} /></td>
                  <td className="conf-cell"><div className="conf"><div className="conf__fill" style={{ width: `${a.progress}%` }} /></div><span>{a.progress} %</span></td>
                  <td>{a.createdBy}</td>
                  <td>{fmtDate(a.createdAt, true)}</td>
                  <td>
                    {a.status === 'echec' && can.launch && (
                      <button className="btn btn--sm" onClick={(e) => { e.stopPropagation(); setConfirm(a.id); }}><RotateCcw size={13} /> Relancer</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {current && (
        <Modal title={`Analyse ${current.id}`} onClose={() => setOpen(null)} width={640}>
          <div className="an-head">
            <AnalysisBadge status={current.status} />
            <span>{current.zoneLabel} · {SEASON_BY_ID[current.seasonId]?.label}</span>
          </div>
          {current.error && <p className="note note--danger">{current.error}</p>}
          {current.warnings.map((w, i) => <p key={i} className="note note--warn">{w}</p>)}
          <dl className="kv kv--wide">
            <dt>Version du pipeline</dt><dd>{current.pipelineVersion}</dd>
            <dt>Scènes utilisées</dt><dd>{current.scenes || '—'}</dd>
            <dt>Résultat</dt><dd>{current.parcelCount !== undefined ? `${fmtInt(current.parcelCount)} parcelles · ${fmtHa(current.areaHa ?? 0)}` : '—'}</dd>
            <dt>Début → fin</dt><dd>{fmtDate(current.startedAt, true)} → {fmtDate(current.finishedAt, true)}</dd>
          </dl>
          <h3>Étapes du pipeline</h3>
          <ol className="steps">
            {PIPELINE_STEPS.map((s, i) => {
              const done = current.progress >= ((i + 1) / PIPELINE_STEPS.length) * 100 - 0.01;
              const active = !done && current.status === 'en_cours' && current.progress >= (i / PIPELINE_STEPS.length) * 100;
              const failed = current.status === 'echec' && !done && current.progress >= (i / PIPELINE_STEPS.length) * 100;
              return (
                <li key={s} className={done ? 'is-done' : active ? 'is-active' : failed ? 'is-failed' : ''}>
                  {done ? <Check size={14} /> : active || failed ? <CircleDot size={14} /> : <Circle size={14} />}{s}
                </li>
              );
            })}
          </ol>
          <h3>Journal</h3>
          <div className="logs">
            {current.logs.length === 0 && <span className="muted">Aucun message pour l'instant.</span>}
            {current.logs.map((l, i) => (
              <div key={i} className={`log log--${l.level}`}><time>{new Date(l.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>{l.msg}</div>
            ))}
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title="Relancer l'analyse ?" onClose={() => setConfirm(null)} footer={<>
          <button className="btn btn--ghost" onClick={() => setConfirm(null)}>Annuler</button>
          <button className="btn btn--primary" onClick={() => { relaunch(confirm); setConfirm(null); }}>Relancer</button></>}>
          <p>L'analyse {confirm} sera remise en file d'attente. Les scènes déjà téléchargées seront réutilisées.</p>
        </Modal>
      )}
      {creating && <NewAnalysisModal onClose={() => setCreating(false)} />}
    </div>
  );
}
