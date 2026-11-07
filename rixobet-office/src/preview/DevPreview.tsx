import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { matchRoute } from '../nav/catalog';
import { PortalFrame } from '../ui/PortalFrame';
import { PortalPage } from '../ui/PortalPage';

export function DevPreview() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = matchRoute(location.pathname);

  useEffect(() => {
    if (!route) navigate('/owner', { replace: true });
  }, [navigate, route]);

  if (!route) return <p className="rx-wait">Открытие макета…</p>;

  return (
    <PortalFrame
      role={route.role}
      session={null}
      linkBase=""
      banner="Макет интерфейса. Сессия не выдана. Не подключено."
      exitLabel="Ко входу"
      denied={false}
      onExit={() => {
        window.location.assign('/login');
      }}
    >
      <PortalPage route={route} />
    </PortalFrame>
  );
}
