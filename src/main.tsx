import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initPwa } from './lib/pwa';
import { preloadGameAssets } from './lib/preloadGameAssets';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
