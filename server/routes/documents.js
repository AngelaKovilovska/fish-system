const express = require('express');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const IS_PROD = process.env.NODE_ENV === 'production';
const ASSET_ROOT = path.join(__dirname, '..', '..', 'client', IS_PROD ? 'dist' : 'public');
const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

// ── Headless Chromium (lazy singleton) ──
let browserPromise = null;

async function getBrowser() {
  if (browserPromise) return browserPromise;

  const puppeteer = require('puppeteer-core');
  browserPromise = puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });

  browserPromise
    .then((browser) => browser.on('disconnected', () => { browserPromise = null; }))
    .catch(() => { browserPromise = null; });

  return browserPromise;
}

// ── Inline local assets (fonts, logo) as data URIs so rendering needs no network ──
const assetCache = new Map();

function assetDataUri(relPath, mime) {
  if (assetCache.has(relPath)) return assetCache.get(relPath);
  const abs = path.join(ASSET_ROOT, relPath);
  if (!abs.startsWith(ASSET_ROOT) || !fs.existsSync(abs)) return null;
  const uri = `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
  assetCache.set(relPath, uri);
  return uri;
}

function inlineAssets(html) {
  return html
    .replace(/url\(['"]?\/fonts\/([\w.-]+)(?:\?[^'")]*)?['"]?\)/g, (m, file) => {
      const uri = assetDataUri(`fonts/${file}`, 'font/ttf');
      return uri ? `url('${uri}')` : m;
    })
    .replace(/src=["']\/images\/([\w.-]+)["']/g, (m, file) => {
      const uri = assetDataUri(`images/${file}`, 'image/png');
      return uri ? `src="${uri}"` : m;
    });
}

// POST /api/documents/pdf — render HTML document to PDF
router.post('/pdf', authMiddleware, async (req, res) => {
  const { html } = req.body || {};
  if (typeof html !== 'string' || !html.trim()) {
    return res.status(400).json({ error: 'Недостасува HTML содржина' });
  }
  if (html.length > 800_000) {
    return res.status(413).json({ error: 'Документот е преголем' });
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(inlineAssets(html), { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('PDF render error:', err.message);
    res.status(500).json({ error: 'Грешка при генерирање на PDF' });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

module.exports = router;
