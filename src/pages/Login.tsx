import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import { ROLES, USERS_BY_ROLE } from '../data/roles';
import type { Role } from '../types';

export default function Login() {
  const login = useApp((s) => s.login);
  const nav = useNavigate();
  const go = (r: Role) => { login(r); nav('/carte'); };
  return (
    <div className="login">
      <div className="login__intro">
        <svg viewBox="0 0 120 120" width="72" height="72" aria-hidden>
          <rect width="120" height="120" rx="26" fill="#12262B" />
          <path d="M18 84l32-54 22 36 14-22 16 40z" fill="#E3B505" />
          <path d="M18 84l32-54 10 17-18 37z" fill="#3E9B4F" opacity="0.9" />
        </svg>
        <h1>Cartographie agricole de Madagascar</h1>
        <p>Parcelles détectées et cultures estimées à partir d'images satellite (données réelles du backend Malto). Choisissez une session pour explorer l'application.</p>
      </div>
      <div className="login__roles" role="list">
        {(Object.keys(ROLES) as Role[]).map((r) => (
          <button key={r} className="role-card" onClick={() => go(r)} role="listitem">
            <b>{ROLES[r].label}</b>
            <span>{ROLES[r].description}</span>
            <em>{USERS_BY_ROLE[r]}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
