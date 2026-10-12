import { useState } from 'react';
import { useApp } from '../store/useApp';
import { SEASONS } from '../data/constants';
import { Modal } from './ui';

export default function NewAnalysisModal({ onClose, withZone }: { onClose: () => void; withZone?: boolean }) {
  const regions = useApp((s) => s.regions);
  const communes = useApp((s) => s.communes);
  const zone = useApp((s) => s.zone);
  const f = useApp((s) => s.filters);
  const [scope, setScope] = useState<'zone' | 'region' | 'commune'>(withZone && zone ? 'zone' : f.communeId ? 'commune' : 'region');
  const [regionId, setRegionId] = useState(f.regionId ?? regions[0]?.id ?? '');
  const [communeId, setCommuneId] = useState(f.communeId ?? communes[0]?.id ?? '');
  const [seasonId, setSeasonId] = useState(f.seasonId);
  const { createAnalysis, toast } = useApp.getState();

  const submit = () => {
    let label = '', rid: string | undefined, cid: string | undefined;
    if (scope === 'zone' && zone) {
      const c = communes.find((x) => x.id === (f.communeId ?? ''));
      label = 'Zone dessinée'; cid = c?.id; rid = c?.regionId ?? f.regionId ?? undefined;
    } else if (scope === 'commune') {
      const c = communes.find((x) => x.id === communeId)!; label = `Commune ${c.name}`; cid = c.id; rid = c.regionId;
    } else {
      const r = regions.find((x) => x.id === regionId)!; label = `Région ${r.name}`; rid = r.id;
    }
    const a = createAnalysis({ zoneLabel: label, regionId: rid, communeId: cid, seasonId, zone: scope === 'zone' ? zone : null });
    toast(a.cached ? `Analyse ${a.id} : résultats réutilisés depuis le cache.` : `Analyse ${a.id} mise en file d'attente.`, a.cached ? 'info' : 'ok');
    onClose();
  };

  return (
    <Modal title="Nouvelle analyse" onClose={onClose}
      footer={<><button className="btn btn--ghost" onClick={onClose}>Annuler</button><button className="btn btn--primary" onClick={submit}>Lancer l'analyse</button></>}>
      <fieldset className="field">
        <legend>Périmètre</legend>
        <div className="radios">
          {zone && <label><input type="radio" checked={scope === 'zone'} onChange={() => setScope('zone')} /> Zone dessinée sur la carte</label>}
          <label><input type="radio" checked={scope === 'region'} onChange={() => setScope('region')} /> Région</label>
          <label><input type="radio" checked={scope === 'commune'} onChange={() => setScope('commune')} /> Commune</label>
        </div>
      </fieldset>
      {scope === 'region' && (
        <label className="field"><span>Région</span>
          <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </label>
      )}
      {scope === 'commune' && (
        <label className="field"><span>Commune</span>
          <select value={communeId} onChange={(e) => setCommuneId(e.target.value)}>{communes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
      )}
      <label className="field"><span>Saison agricole</span>
        <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </label>
      <p className="hint">Le traitement est asynchrone. Si les mêmes entrées ont déjà été traitées, les résultats existants sont réutilisés sans nouveau calcul.</p>
    </Modal>
  );
}
