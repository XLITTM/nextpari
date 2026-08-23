import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isAgentTerminalPath } from './lib/cashier';
import { isBackofficePath } from './lib/backoffice';
import { MobcashAgentScreen } from './screens/MobcashAgentScreen';
import { ManagerDashboardScreen } from './screens/ManagerDashboardScreen';
import { ThemeProvider } from './ThemeContext';
import { initPwa } from './lib/pwa';
import { preloadGameAssets } from './lib/preloadGameAssets';

initPwa();
preloadGameAssets();

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    {isAgentTerminalPath() ? (
      <ThemeProvider>
        <MobcashAgentScreen />
      </ThemeProvider>
    ) : isBackofficePath() ? (
      <ManagerDashboardScreen />
    ) : (
      <App />
    )}
  </StrictMode>
);
