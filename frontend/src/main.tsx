import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { initI18n } from '@/i18n';
import { store } from '@/store/store';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

// In this device's language from the first paint; English if its words
// cannot be fetched.
void initI18n(store.getState().language.current)
  .catch(() => undefined)
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
