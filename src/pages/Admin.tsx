import { useMemo, useState } from 'react';
import { useApp } from '../store/useApp';
import { ROLES } from '../data/constants';
import { fmtDate } from '../lib/format';
import type { Role } from '../types';
import { Badge } from '../components/ui';

export default function Admin() {
  const [tab, setTab] = useState<'users' | 'audit' | 'settings'>('users');
  const [q, setQ] = useState('');
  const users = useApp((s) => s.users);
  const audit = useApp((s) => s.audit);
  const threshold = useApp((s) => s.threshold);
  const setThreshold = useApp((s) => s.setThreshold);
  const setRole = useApp((s) => s.setUserRole);
  const toggle = useApp((s) => s.toggleUserActive);
  const me = useApp((s) => s.user)!;

  const filtered = useMemo(() => {
    const n = q.toLowerCase();
    return audit.filter((a) => !n || `${a.userName} ${a.action} ${a.object}`.toLowerCase().includes(n));
  }, [audit, q]);

  return (
    <div className="page page--single">
      <div className="content content--wide">
        <div className="content__head"><div><h1>Administration</h1><p className="muted">Comptes, journal d'audit et paramètres.</p></div></div>
        <div className="tabs" role="tablist">
          {([['users', 'Utilisateurs'], ['audit', "Journal d'audit"], ['settings', 'Paramètres']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'users' && (
          <div className="tablewrap tablewrap--page"><table className="table">
            <thead><tr><th>Nom</th><th>Courriel</th><th>Rôle</th><th>Dernière connexion</th><th>Compte</th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b></td><td>{u.email}</td>
                <td><select value={u.role} disabled={u.id === me.id} onChange={(e) => setRole(u.id, e.target.value as Role)} aria-label={`Rôle de ${u.name}`}>
                  {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</select></td>
                <td>{fmtDate(u.lastLogin, true)}</td>
                <td><button className="btn btn--sm" disabled={u.id === me.id} onClick={() => toggle(u.id)}>{u.active ? 'Actif — désactiver' : 'Inactif — réactiver'}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}

        {tab === 'audit' && (
          <>
            <label className="search search--block"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par personne, action ou objet" aria-label="Filtrer le journal" /></label>
            <div className="tablewrap tablewrap--page"><table className="table">
              <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Objet</th></tr></thead>
              <tbody>{filtered.slice(0, 100).map((a) => (
                <tr key={a.id}><td>{fmtDate(a.at, true)}</td><td>{a.userName}</td><td><Badge tone={/Export|Rejet|rôle/.test(a.action) ? 'warn' : 'neutral'}>{a.action}</Badge></td><td>{a.object}</td></tr>
              ))}</tbody>
            </table></div>
          </>
        )}

        {tab === 'settings' && (
          <section className="card card--narrow">
            <h2>Seuil d'incertitude</h2>
            <p className="hint">En dessous de ce score, une parcelle est dessinée en pointillés et comptée comme incertaine sur la carte, le tableau de bord et les exports.</p>
            <label className="field"><span>Seuil : <b>{Math.round(threshold * 100)} %</b></span>
              <input type="range" min={30} max={90} step={5} value={Math.round(threshold * 100)} onChange={(e) => setThreshold(+e.target.value / 100)} /></label>
            <h2>Licences et sources</h2>
            <ul className="plain">
              <li>Sentinel-1/2 — Copernicus (usage libre, attribution requise).</li>
              <li>Fond satellite Esri et fond OpenStreetMap — réservés au prototype ; vérifier les licences avant mise en production.</li>
              <li>Limites administratives — fictives dans cette démonstration.</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
