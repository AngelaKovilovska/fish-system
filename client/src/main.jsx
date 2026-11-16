import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Автоматско ажурирање на инсталираната апликација (икона на почетен екран) ──
// Инсталираната апликација ретко се „вчитува одново“ — само се враќа од позадина, па прелистувачот
// не проверува за нова верзија. Затоа:
//  1) при секое враќање во апликацијата (и на секои 30 мин.) бараме нова верзија од серверот;
//  2) штом новата верзија ќе преземе, страната се освежува — веднаш ако нема незачуван внес на тековната
//     страница, инаку штом корисникот ќе ја напушти таа страница (за да не му пропадне внесот).
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  // Страница на која корисникот впишал нешто (незачуван внес). Додека е на таа страница не освежуваме пред него.
  let dirtyPath = null;
  window.addEventListener('input', () => { dirtyPath = window.location.pathname; }, { capture: true, passive: true });
  const hasUnsavedInput = () => dirtyPath !== null && dirtyPath === window.location.pathname;

  let reloading = false;
  const reloadNow = () => { if (!reloading) { reloading = true; window.location.reload(); } };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    // Без незачуван внес → освежи веднаш. Со внес → почекај корисникот да ја напушти страницата со формата.
    if (!hasUnsavedInput()) { reloadNow(); return; }
    const timer = setInterval(() => { if (!hasUnsavedInput()) { clearInterval(timer); reloadNow(); } }, 2000);
  });

  let lastCheck = 0;
  const checkForUpdate = () => {
    if (!navigator.onLine || Date.now() - lastCheck < 60 * 1000) return;
    lastCheck = Date.now();
    navigator.serviceWorker.getRegistration().then(reg => reg && reg.update()).catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
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
