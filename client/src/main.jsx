import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Кога ќе се активира нова верзија (service worker) додека апликацијата е отворена,
// освежи ја страната штом корисникот ќе ја напушти (таб во позадина), за да не му пропадне внес.
// (Ако во меѓувреме отвори страница од старата верзија, lazyPage сам освежува.)
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (document.visibilityState === 'hidden') { window.location.reload(); return; }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') window.location.reload();
    }, { once: true });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
