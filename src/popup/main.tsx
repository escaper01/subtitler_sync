import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tailwind.css';
import { Popup } from '@/popup/Popup';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
}
