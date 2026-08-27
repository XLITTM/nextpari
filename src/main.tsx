import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initPwa } from './lib/pwa';
import { preloadGameAssets } from './lib/preloadGameAssets';
import { isAgentTerminalPath } from './lib/cashier';
import { isBackofficePath, isManagerOfficePath } from './lib/backoffice';
import { ManagerDashboardScreen } from './screens/ManagerDashboardScreen';
import { ManagerOfficeScreen } from './screens/ManagerOfficeScreen';
import { MobcashAgentScreen } from './screens/MobcashAgentScreen';

initPwa();
preloadGameAssets();

if ('serviceWorker' in navigator) {
  const registerSw = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore unsupported contexts */
    });
  };
  if (document.readyState === 'complete') registerSw();
  else window.addEventListener('load', registerSw);
}

const root = createRoot(document.getElementById('root')!);

const staffScreen = isAgentTerminalPath()
  ? <MobcashAgentScreen />
  : isManagerOfficePath()
    ? <ManagerOfficeScreen />
    : isBackofficePath()
      ? <ManagerDashboardScreen />
      : null;

root.render(
  <StrictMode>
    <ErrorBoundary>
      {staffScreen ?? <App />}
    </ErrorBoundary>
  </StrictMode>
);
