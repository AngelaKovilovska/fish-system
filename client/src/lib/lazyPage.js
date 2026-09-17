import { lazy } from 'react';

// Lazy-вчитување на страници отпорно на нова верзија.
// По секој деплој старите .js делови (со стар hash) веќе не постојат; ако корисникот има отворена
// стара верзија и отвори страница што уште не била вчитана, import-от паѓа. Во тој случај
// страната се освежува еднаш за да се земе новата верзија, наместо да се прикаже „Нешто не е во ред“.
const RELOAD_KEY = 'clario-chunk-reload';

export function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|Loading CSS chunk|error loading dynamically imported module/i.test(msg);
}

export function reloadOnceForNewVersion() {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* ignore */ }
  window.location.reload();
  return true;
}

export function clearReloadFlag() {
  try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
}

export function lazyPage(importer) {
  return lazy(() =>
    importer()
      .then(mod => { clearReloadFlag(); return mod; })
      .catch(err => {
        if (isChunkLoadError(err) && reloadOnceForNewVersion()) {
          // Страната се освежува — врати празна компонента додека трае
          return new Promise(() => {});
        }
        throw err;
      })
  );
}
