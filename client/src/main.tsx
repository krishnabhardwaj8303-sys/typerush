import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProfileProvider } from './lib/ProfileContext';
import { OnlineProvider } from './net/OnlineContext';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// Note: StrictMode is intentionally not used. It double-runs effects in development,
// which would open and close the multiplayer socket twice and make local testing confusing.
createRoot(container).render(
  <ProfileProvider>
    <OnlineProvider>
      <App />
    </OnlineProvider>
  </ProfileProvider>,
);
