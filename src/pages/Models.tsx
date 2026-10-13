import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CLASS_METRICS, CONFUSION_MATRIX, CONF_LABELS, F1_BY_REGION, MODEL_VERSIONS, SEG_BY_SIZE } from '../data/models';
import { CULTURE_BY_ID } from '../data/constants';
import { fmtDate, fmtInt, fmtPct } from '../lib/format';
import { Badge, Swatch } from '../components/ui';
import { useApp } from '../store/useApp';
import { api, type DeployedModels } from '../api/services';

/** Affiche un bloc de métriques réelles (valeurs 0-1 → %). */
function Metric({ label, value }: { label: string; value: number | undefined }) {
  return <tr><td>{label}</td><td className="num">{value === undefined ? '—' : fmtPct(value)}</td></tr>;
}

/** Section « modèles réellement déployés » — données vives de GET /api/modeles (Malto). */
function DeployedModelsSection() {
  const [models, setModels] = useState<DeployedModels | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getDeployedModels()
      .then((m) => { if (alive) setModels(m); })
      .catch((err: Error) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return <p className="note note--warn">Modèles déployés injoignables ({error}). Les évaluations ci-dessous restent des démonstrations fictives.</p>;
  }
  if (!models) return <p className="hint">Interrogation du backend Malto (GET /api/modeles)…</p>;

  const rf = models.classification_orge;
  const vhr = models.delimitation_vhr;
  return (
    <section className="card">
      <h2>Modèles déployés (Malto — données réelles)</h2>
      <p className="hint">Inventaire lu directement sur le backend : fichiers chargés, état des services et métriques d'entraînement réelles.</p>
      <div className="grid2">
        <div>
          <h3>{rf.nom}</h3>
          <p className="muted">{rf.type}</p>
          <p><Badge tone={rf.statut === 'pret' ? 'ok' : 'danger'}>{rf.statut === 'pret' ? 'Déployé' : rf.statut}</Badge>{' '}
            <code>{rf.fichier}</code>{rf.modifie_le ? <> · entraîné le {fmtDate(rf.modifie_le)}</> : null}</p>
          {rf.metriques && (
            <div className="tablewrap"><table className="table">
              <thead><tr><th>Métrique (jeu de test indépendant)</th><th className="num">Valeur</th></tr></thead>
              <tbody>
                <Metric label="F1 orge" value={rf.metriques.f1_orge} />
                <Metric label="Précision orge" value={rf.metriques.precision_orge} />
                <Metric label="Rappel orge" value={rf.metriques.rappel_orge} />
                <Metric label="Accuracy" value={rf.metriques.accuracy} />
                <Metric label="ROC AUC" value={rf.metriques.roc_auc} />
                <Metric label="PR AUC" value={rf.metriques.pr_auc} />
                <tr><td>Seuil de décision</td><td className="num">{rf.metriques.seuil.toFixed(2)}</td></tr>
                <tr><td>Matrice de confusion (TN / FP / FN / TP)</td><td className="num">{rf.metriques.tn} / {rf.metriques.fp} / {rf.metriques.fn} / {rf.metriques.tp}</td></tr>
              </tbody>
            </table></div>
          )}
          {rf.entrainement && (
            <p className="hint">{rf.entrainement.n_features} caractéristiques · {fmtInt(rf.entrainement.n_lignes)} échantillons · {rf.entrainement.n_splits} plis (split spatial anti-fuite : {rf.entrainement.anti_leakage_ok ? 'OK' : 'non vérifié'}).</p>
          )}
        </div>
        <div>
          <h3>{vhr.nom}</h3>
          <p className="muted">{vhr.type}</p>
          <p><Badge tone={vhr.statut === 'pret' ? 'ok' : vhr.statut === 'injoignable' ? 'danger' : 'warn'}>{vhr.statut === 'pret' ? 'Service en ligne' : vhr.statut}</Badge>{' '}
            <code>{vhr.service}</code></p>
          {vhr.statut === 'pret' && (
            <ul className="hint">
              <li>Modèle chargé : <code>{vhr.modele_charge ?? '—'}</code>{vhr.modele_present === false ? ' (fichier absent)' : ''}</li>
              <li>Modes : {(vhr.modes ?? []).join(', ') || '—'}</li>
              <li>Sert les contours affichés sur la carte (route <code>/api/zone-parcels</code>).</li>
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Models() {
  const colors = useApp((s) => s.colors);
  const max = Math.max(...CONFUSION_MATRIX.flat());
  return (
    <div className="page page--single">
      <div className="content content--wide">
        <div className="content__head">
          <div><h1>Modèles IA</h1><p className="muted">Versions déployées et résultats d'évaluation sur le jeu de test géographiquement indépendant.</p></div>
        </div>
        <DeployedModelsSection />

        <p className="note note--warn">Évaluations ci-dessous fictives de démonstration (les modèles réellement déployés sont listés ci-dessus). Les seuils d'acceptation seront fixés après le pilote (cahier des charges, §9.5) ; un score de confiance n'est pas une probabilité calibrée tant qu'il n'a pas été validé.</p>

        <section className="card">
          <h2>Versions (démonstration)</h2>
          <div className="tablewrap"><table className="table">
            <thead><tr><th>Modèle</th><th>Type</th><th>État</th><th>Date</th><th>Description</th></tr></thead>
            <tbody>{MODEL_VERSIONS.map((m) => (
              <tr key={m.id}><td><b>{m.id}</b></td><td>{m.kind}</td>
                <td><Badge tone={m.status === 'Production' ? 'ok' : m.status === 'En comparaison' ? 'info' : 'muted'}>{m.status}</Badge></td>
                <td>{fmtDate(m.date)}</td><td>{m.note}</td></tr>
            ))}</tbody>
          </table></div>
        </section>

        <div className="grid2">
          <section className="card">
            <h2>Segmentation des parcelles</h2>
            <p className="hint">Résultats par taille de parcelle : les petites parcelles sont les plus difficiles à détecter à 10 m de résolution.</p>
            <div className="tablewrap"><table className="table">
              <thead><tr><th>Taille</th><th className="num">IoU</th><th className="num">F1</th><th className="num">Fusions</th></tr></thead>
              <tbody>{SEG_BY_SIZE.map((s) => (
                <tr key={s.label}><td>{s.label}</td><td className="num">{s.iou.toFixed(2)}</td><td className="num">{s.f1.toFixed(2)}</td><td className="num">{Math.round(s.merge * 100)} %</td></tr>
              ))}</tbody>
            </table></div>
          </section>

          <section className="card">
            <h2>F1 par région</h2>
            <p className="hint">Test sur des zones absentes de l'entraînement.</p>
            <div className="chart" style={{ height: 210 }}>
              <ResponsiveContainer>
                <BarChart data={F1_BY_REGION} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid horizontal={false} stroke="#E3E9E6" />
                  <XAxis type="number" domain={[0, 1]} fontSize={12} />
                  <YAxis type="category" dataKey="region" width={120} fontSize={12} />
                  <Tooltip formatter={(v: number) => [v.toFixed(2), 'F1']} />
                  <Bar dataKey="f1" fill="#0F7F86" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <section className="card">
          <h2>Classification des cultures — RF 1.1.0</h2>
          <div className="tablewrap"><table className="table">
            <thead><tr><th>Classe</th><th className="num">Précision</th><th className="num">Rappel</th><th className="num">F1</th><th className="num">Échantillons</th></tr></thead>
            <tbody>{CLASS_METRICS.map((m) => (
              <tr key={m.id}><td><Swatch color={colors[m.id]} /> {CULTURE_BY_ID[m.id].label}</td>
                <td className="num">{m.precision.toFixed(2)}</td><td className="num">{m.recall.toFixed(2)}</td><td className="num"><b>{m.f1.toFixed(2)}</b></td><td className="num">{m.support}</td></tr>
            ))}</tbody>
          </table></div>
        </section>

        <section className="card">
          <h2>Matrice de confusion</h2>
          <p className="hint">Lignes : classe réelle (terrain). Colonnes : classe prédite. Les confusions orge ↔ maïs ↔ haricot sont les plus fréquentes.</p>
          <div className="tablewrap"><table className="matrix">
            <thead><tr><th />{CONF_LABELS.map((l) => <th key={l}>{l}</th>)}</tr></thead>
            <tbody>{CONFUSION_MATRIX.map((row, i) => (
              <tr key={i}><th>{CONF_LABELS[i]}</th>{row.map((v, j) => (
                <td key={j} className={i === j ? 'diag' : ''} style={{ background: `rgba(15,127,134,${0.06 + (v / max) * 0.75})`, color: v / max > 0.45 ? '#fff' : 'inherit' }}>{v}</td>
              ))}</tr>
            ))}</tbody>
          </table></div>
        </section>
      </div>
    </div>
  );
}
