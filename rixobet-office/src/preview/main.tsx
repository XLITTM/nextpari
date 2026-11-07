import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { DevPreview } from './DevPreview';
import '../ui/office.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <DevPreview />
    </HashRouter>
  </StrictMode>,
);
