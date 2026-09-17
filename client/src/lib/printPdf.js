// Печатење на PDF на телефон: страниците се исцртуваат со pdf.js како слики, се ставаат во скриен
// iframe со А4 страници без маргини и се отвора дијалогот за печатење на уредот.
// (На телефон iframe со PDF не може да печати, а системскиот прегледувач нема секогаш „Печати“.)

async function renderPagesAsImages(url, scale = 2.5) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Документот не може да се вчита');
  const pdf = await pdfjs.getDocument({ data: await res.arrayBuffer() }).promise;

  const images = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    images.push({ src: canvas.toDataURL('image/jpeg', 0.92), landscape: viewport.width > viewport.height });
  }
  return images;
}

export async function printPdfViaImages(url) {
  const images = await renderPagesAsImages(url);
  const orientation = images[0]?.landscape ? 'landscape' : 'portrait';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Печати</title>
<style>
  @page { size: A4 ${orientation}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  img { display: block; width: 100%; height: auto; page-break-after: always; break-after: page; }
  img:last-child { page-break-after: auto; break-after: auto; }
</style></head><body>${images.map(i => `<img src="${i.src}">`).join('')}</body></html>`;

  // Отстрани стар iframe ако останал
  document.getElementById('clario-print-frame')?.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'clario-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(iframe);

  await new Promise((resolve, reject) => {
    iframe.onload = () => {
      // Почекај сликите да се вчитаат, па печати
      const doc = iframe.contentDocument;
      const imgs = Array.from(doc.images);
      const waitImgs = Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
      waitImgs.then(() => {
        try {
          const w = iframe.contentWindow;
          w.focus();
          if (typeof w.print === 'function') w.print();
          else doc.execCommand('print', false, null);
          resolve();
        } catch (e) { reject(e); }
      });
    };
    iframe.srcdoc = html;
  });

  // Остави го iframe-от малку (некои прелистувачи печатат асинхроно), па исчисти
  setTimeout(() => iframe.remove(), 60000);
}
