import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './store/useApp';
import { ROLES } from './data/constants';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import MapPage from './pages/MapPage';
import Dashboard from './pages/Dashboard';
import Parcels from './pages/Parcels';
import Analyses from './pages/Analyses';
import Models from './pages/Models';
import Admin from './pages/Admin';

function Guard({ children, perm }: { children: JSX.Element; perm?: keyof (typeof ROLES)['admin']['can'] }) {
  const user = useApp((s) => s.user);
  if (!user) return <Navigate to="/connexion" replace />;
  if (perm && !ROLES[user.role].can[perm]) return <Navigate to="/carte" replace />;
  return children;
}

export default function App() {
  const ready = useApp((s) => s.ready);
  const init = useApp((s) => s.init);
  useEffect(() => { void init(); }, [init]);

  if (!ready) return <div className="boot"><div className="boot__bar" /><p>Chargement des parcelles…</p></div>;

  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route element={<Guard><AppShell /></Guard>}>
        <Route path="/carte" element={<MapPage />} />
        <Route path="/tableau-de-bord" element={<Dashboard />} />
        <Route path="/parcelles" element={<Parcels />} />
        <Route path="/analyses" element={<Guard perm="analyses"><Analyses /></Guard>} />
        <Route path="/modeles" element={<Guard perm="models"><Models /></Guard>} />
        <Route path="/administration" element={<Guard perm="admin"><Admin /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/carte" replace />} />
    </Routes>
  );
}
