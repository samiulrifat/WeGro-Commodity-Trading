import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { captureInstallOffer } from '@/app/pwa/install';
import { watchConnection } from '@/app/session';
import { startEarly } from '@/app/startup';
import { initI18n } from '@/i18n';
import { store } from '@/store/store';
import './index.css';

// Before anything renders: the browser makes its install offer only once.
captureInstallOffer();
watchConnection(store);
// The session and the first page's code, while the language loads.
startEarly(store);

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
