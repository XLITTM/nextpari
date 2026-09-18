import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';
import { SentryRootFallback } from './components/SentryRootFallback';
import { initSentry, maybeTriggerSentryTest } from './lib/sentry';
import { initPwa } from './lib/pwa';
import { preloadGameAssets } from './lib/preloadGameAssets';

initSentry();
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

maybeTriggerSentryTest();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<SentryRootFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
);
