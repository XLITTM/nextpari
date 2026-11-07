import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { accessDecision } from './access/guard';
import type { OfficeRoute } from './access/model';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { homeFor, OFFICE_ROUTES } from './nav/catalog';
import { ActivationPage } from './ui/ActivationPage';
import { LoginPage } from './ui/LoginPage';
import { PortalFrame } from './ui/PortalFrame';
import { PortalPage } from './ui/PortalPage';

function SessionFallback() {
  const auth = useAuth();
  if (!auth.ready) return <p className="rx-wait">Проверка сессии…</p>;
  if (!auth.session) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(auth.session.role)} replace state={{ denied: true }} />;
}

function RequireAccess({ route }: { route: OfficeRoute }) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (!auth.ready) return <p className="rx-wait">Проверка сессии…</p>;
  const decision = accessDecision(auth.session, route.path, location.search);
  if (decision === 'login') return <Navigate to="/login" replace />;
  if (decision === 'deny' || !auth.session) {
    return <Navigate to={auth.session ? homeFor(auth.session.role) : '/login'} replace state={{ denied: true }} />;
  }
  const denied = Boolean((location.state as { denied?: boolean } | null)?.denied);
  return (
    <PortalFrame
      role={auth.session.role}
      session={auth.session}
      linkBase=""
      exitLabel="Выйти"
      denied={denied}
      onExit={() => {
        void auth.logout().then(() => navigate('/login', { replace: true }));
      }}
    >
      <PortalPage route={route} />
    </PortalFrame>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/activate" element={<ActivationPage />} />
      {OFFICE_ROUTES.map((route) => (
        <Route key={route.path} path={route.path} element={<RequireAccess route={route} />} />
      ))}
      <Route path="*" element={<SessionFallback />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
