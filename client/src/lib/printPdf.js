// Печатење / споделување на PDF на телефон.
//
// - iPhone/iPad: Safari при печатење на веб-страница додава свои маргини и ја смалува страната, а тоа
//   не може да се исклучи. Единствен начин за вистинска големина е да се печати самиот PDF преку
//   системскиот лист „Сподели“ → „Печати“ (Web Share API со датотека).
// - Android: страниците се исцртуваат со pdf.js како слики на А4 без маргини во скриен iframe и
//   се отвора дијалогот за печатење на уредот.

export const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function fetchPdfBytes(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Документот не може да се вчита');
  return res.arrayBuffer();
}

// Може ли системски да се сподели PDF датотека (iOS 15+, Android Chrome)
export function canSharePdf() {
  try {
    const f = new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' });
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });
  } catch { return false; }
}

// Мора да се повика директно од клик (без await пред тоа) — Safari бара корисничка акција
export function sharePdf(bytes, fileName, title) {
  const file = new File([bytes], `${fileName}.pdf`, { type: 'application/pdf' });
  return navigator.share({ files: [file], title: title || fileName });
}

// Печатачите не печатат до самиот раб: содржина што допира до работ ја смалуваат („fit to page“).
// Затоа страницата се сече за INSET_MM од сите страни и се печати со исти толкави маргини —
// содржината останува во вистинска големина и на исто место, само работ (5 mm) не се печати.
const INSET_MM = 5;
const MM_TO_PT = 72 / 25.4;

async function renderPagesAsImages(bytes, scale = 2.5) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // pdf.js го „троши“ бафер-от (transfer) → работи со копија
  const pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;

  const images = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // Исечи ги рабовите (INSET_MM) — види коментар горе
    const inset = Math.round(INSET_MM * MM_TO_PT * scale);
    const cropped = document.createElement('canvas');
    cropped.width = canvas.width - 2 * inset;
    cropped.height = canvas.height - 2 * inset;
    cropped.getContext('2d').drawImage(canvas, inset, inset, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);

    images.push({ src: cropped.toDataURL('image/jpeg', 0.92), landscape: viewport.width > viewport.height });
  }
  return images;
}

export async function printPdfViaImages(bytes) {
  const images = await renderPagesAsImages(bytes);
  const landscape = !!images[0]?.landscape;
  // А4 минус маргини од INSET_MM на секоја страна
  const PW = `${(landscape ? 297 : 210) - 2 * INSET_MM}mm`;
  const PH = `${(landscape ? 210 : 297) - 2 * INSET_MM}mm`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Печати</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${INSET_MM}mm; }
  html, body { margin: 0; padding: 0; background: #fff; width: ${PW}; }
  .page { width: ${PW}; height: ${PH}; overflow: hidden; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .page img { display: block; width: ${PW}; height: ${PH}; }
</style></head><body>${images.map(i => `<div class="page"><img src="${i.src}"></div>`).join('')}</body></html>`;

  document.getElementById('clario-print-frame')?.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'clario-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(iframe);

  await new Promise((resolve, reject) => {
    iframe.onload = () => {
      const doc = iframe.contentDocument;
      const imgs = Array.from(doc.images);
      Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })))
        .then(() => {
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

  setTimeout(() => iframe.remove(), 60000);
}
