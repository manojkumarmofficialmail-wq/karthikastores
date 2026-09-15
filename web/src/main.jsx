import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// The service worker makes the storefront installable and lets the catalogue
// open without a connection. Dev builds skip it so hot reload is not cached.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const register = () =>
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error.message);
    });

  // Registering after first paint keeps it off the critical path — but if the
  // document has already finished loading by the time this module runs, the
  // load event is never coming.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
