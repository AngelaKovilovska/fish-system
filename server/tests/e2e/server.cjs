// Тест-сервер: вистинскиот server/index.js (и изградениот клиент, ако постои client/dist) врз вградена
// PostgreSQL база во меморија (PGlite). Ништо не се запишува во вистинската база; при секое стартување
// базата е празна, се извршуваат сите миграции и се креира админ (admin@clario.mk / AdminLozinka1).
// Е-поштата не се испраќа — последната порака се запишува во датотека (EMAIL_FILE).
//
//   npm run test:server      → стартува на http://127.0.0.1:4100
//   npm run test:api         → (во друг терминал) ги извршува сите API тестови
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..', '..');
const EMAIL_FILE = process.env.EMAIL_FILE || path.join(os.tmpdir(), 'clario-test-last-email.json');
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.EMAIL_FILE = EMAIL_FILE;
process.env.NODE_ENV = 'production';
process.env.PORT = process.env.PORT || '4100';
process.env.ADMIN_EMAIL = 'admin@clario.mk';
process.env.ADMIN_PASSWORD = 'AdminLozinka1';
process.env.ADMIN_NAME = 'Админ Тест';

(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  // една конекција → редица: трансакција (connect…release) ги блокира другите барања додека не заврши
  let chain = Promise.resolve();
  const lock = () => { let release; const prev = chain; chain = new Promise(r => { release = r; }); return prev.then(() => release); };
  const run = async (t, p) => { const r = await db.query(typeof t === 'string' ? t : t.text, p || t.values); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; };
  const multi = async (t) => { await db.exec(t); return { rows: [], rowCount: 0 }; };
  const exec = (t, p) => ((p === undefined && typeof t === 'string' && /;\s*\S/.test(t)) ? multi(t) : run(t, p));
  const pool = {
    // pool.query не чека на редицата: некои рути повикуваат pool.query додека сè уште држат client (по COMMIT)
    query: (t, p) => exec(t, p),
    connect: async () => { const release = await lock(); let done = false; return { query: (t, p) => exec(t, p), release: () => { if (!done) { done = true; release(); } } }; },
    on() {}, end: async () => {},
  };
  const orig = Module._load;
  Module._load = function (request, ...rest) {
    if (request.endsWith('db/connection')) return pool;
    if (request.endsWith('services/emailService')) return {
      sendReportEmail: async (m) => { fs.writeFileSync(EMAIL_FILE, JSON.stringify({ to: m.to, subject: m.subject, html: m.html, attachments: (m.attachments || []).map(a => a.filename) })); return { success: true, messageId: 'test' }; },
      testConnection: async () => ({ success: true }),
    };
    return orig.call(this, request, ...rest);
  };
  process.chdir(ROOT);
  require(ROOT + '/index.js');
})();
