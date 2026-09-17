import { useEffect, useRef, useState } from 'react';

// Прикажува PDF како слики (canvas) — за телефони, каде iframe не рендерира PDF.
// pdf.js се вчитува само кога е потребно (динамичен import), за да не го оптоварува основниот bundle.
export default function PdfPages({ data }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | done | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;

    (async () => {
      try {
        setStatus('loading');
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        // pdf.js го „троши“ бафер-от (transfer) → работи со копија
        const pdf = await pdfjs.getDocument({ data: data.slice(0) }).promise;
        if (cancelled || !container) return;

        container.innerHTML = '';
        const width = container.clientWidth || 360;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.display = 'block';
          canvas.style.background = '#fff';
          canvas.style.borderRadius = '8px';
          canvas.style.marginBottom = '12px';
          canvas.style.boxShadow = '0 1px 6px rgba(0,0,0,0.25)';
          container.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          if (cancelled) return;
        }
        setStatus('done');
      } catch (e) {
        if (!cancelled) { setStatus('error'); setMessage(e.message || 'Грешка'); }
      }
    })();

    return () => { cancelled = true; };
  }, [data]);

  return (
    <div className="w-full h-full overflow-auto">
      {status === 'loading' && (
        <div className="flex items-center justify-center py-10 text-xs text-(--text-muted) gap-2">
          <span className="w-4 h-4 border-2 border-(--border) border-t-(--primary) rounded-full animate-spin" /> Се вчитува документот…
        </div>
      )}
      {status === 'error' && (
        <div className="alert alert-error text-xs m-2">{message}</div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
