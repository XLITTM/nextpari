import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GroupOwnerApp } from './GroupOwnerApp.tsx';
import './groupOwner.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GroupOwnerApp />
  </StrictMode>,
);
