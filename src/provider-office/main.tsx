import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProviderOfficeApp } from './ProviderOfficeApp.tsx';
import './providerOffice.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProviderOfficeApp />
  </StrictMode>,
);
