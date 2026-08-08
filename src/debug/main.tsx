import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tailwind.css';
import { Debug } from '@/debug/Debug';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Debug />
    </StrictMode>,
  );
}
