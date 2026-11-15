import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Автоматско ажурирање на инсталираната апликација (икона на почетен екран) ──
// Инсталираната апликација ретко се „вчитува одново“ — само се враќа од позадина, па прелистувачот
// не проверува за нова верзија. Затоа:
//  1) при секое враќање во апликацијата (и на секои 30 мин.) бараме нова верзија од серверот;
//  2) штом новата верзија ќе преземе, страната се освежува — веднаш ако корисникот не почнал да внесува,
//     инаку кога ќе ја напушти апликацијата (за да не му пропадне внес).
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  let touchedSinceVisible = false; // дали корисникот кликнал/пишувал откако ја отворил апликацијата
  const markTouched = () => { touchedSinceVisible = true; };
  ['pointerdown', 'keydown', 'input'].forEach(ev => window.addEventListener(ev, markTouched, { capture: true, passive: true }));

  let reloading = false;
  const reloadNow = () => { if (!reloading) { reloading = true; window.location.reload(); } };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (document.visibilityState === 'hidden' || !touchedSinceVisible) { reloadNow(); return; }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') reloadNow();
    }, { once: true });
  });

  let lastCheck = 0;
  const checkForUpdate = () => {
    if (!navigator.onLine || Date.now() - lastCheck < 60 * 1000) return;
    lastCheck = Date.now();
    navigator.serviceWorker.getRegistration().then(reg => reg && reg.update()).catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { touchedSinceVisible = false; checkForUpdate(); }
  });
  window.addEventListener('pageshow', checkForUpdate);
  window.addEventListener('online', checkForUpdate);
  window.addEventListener('focus', checkForUpdate);
  setInterval(checkForUpdate, 30 * 60 * 1000);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
