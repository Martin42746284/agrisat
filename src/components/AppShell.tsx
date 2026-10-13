import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Brain, Check, ClipboardList, Map as MapIcon, Settings, SlidersHorizontal, Table2 } from 'lucide-react';
import { useApp } from '../store/useApp';
import { ROLES } from '../data/constants';
import { activeFilterCount } from '../lib/filter';
import type { Role } from '../types';
import ParcelDrawer from './ParcelDrawer';
import ExportMenu from './ExportMenu';
import { Toasts } from './ui';

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = useApp((s) => s.user)!;
  const login = useApp((s) => s.login);
  const logout = useApp((s) => s.logout);
  const nav = useNavigate();
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <div className="menu" ref={ref}>
      <button className="avatar glass" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Menu utilisateur">{initials}</button>
      {open && (
        <div className="menu__list glass" role="menu">
          <div className="menu__who"><b>{user.name}</b><span>{ROLES[user.role].label}</span></div>
          <div className="menu__label">Changer de profil (démo)</div>
          {(Object.keys(ROLES) as Role[]).map((r) => (
            <button key={r} role="menuitem" onClick={() => { login(r); setOpen(false); }}>
              {user.role === r ? <Check size={15} /> : <span style={{ width: 15 }} />}{ROLES[r].label}
            </button>
          ))}
          <button role="menuitem" onClick={() => { logout(); nav('/connexion'); }}>Écran de connexion</button>
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const user = useApp((s) => s.user)!;
  const selected = useApp((s) => s.selectedId);
  const filtersOpen = useApp((s) => s.filtersOpen);
  const setFiltersOpen = useApp((s) => s.setFiltersOpen);
  const filters = useApp((s) => s.filters);
  const zone = useApp((s) => s.zone);
  const { pathname } = useLocation();
  const onMap = pathname.startsWith('/carte');
  const can = ROLES[user.role].can;
  const count = activeFilterCount(filters, zone);

  useEffect(() => { document.body.dataset.drawer = selected ? 'open' : 'closed'; }, [selected]);

  const items = [
    { to: '/carte', label: 'Carte', icon: MapIcon, show: true },
    { to: '/tableau-de-bord', label: 'Tableau de bord', icon: BarChart3, show: true },
    { to: '/parcelles', label: 'Parcelles', icon: Table2, show: true },
    { to: '/analyses', label: 'Analyses', icon: ClipboardList, show: can.analyses },
    { to: '/modeles', label: 'Modèles IA', icon: Brain, show: can.models },
    { to: '/administration', label: 'Admin', icon: Settings, show: can.admin },
  ].filter((i) => i.show);

  return (
    <div className={`shell ${onMap ? 'shell--map' : ''}`}>
      <main className="shell__page"><Outlet /></main>

      <div className="brandchip glass">
        <img src="/agrisat-logo.svg" width="42" height="42" alt="Logo AGRISAT" />
        <div>
          <strong>AGRISAT</strong>
          <span>Agricultural Remote Sensing &amp; Detection</span>
        </div>
      </div>

      <nav className="dock glass" aria-label="Navigation principale">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => `dock__item ${isActive ? 'is-active' : ''}`}>
            <i.icon size={20} /><span>{i.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="topright">
        {onMap && (
          <>
            <button className={`fab glass ${filtersOpen ? 'fab--on' : ''}`} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
              <SlidersHorizontal size={17} /><span>Filtres</span>{count > 0 && <em className="fab__count">{count}</em>}
            </button>
            <ExportMenu glass />
          </>
        )}
        <UserMenu />
      </div>

      <ParcelDrawer />
      <Toasts />
    </div>
  );
}
