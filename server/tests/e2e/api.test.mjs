// Целосен автоматски тест на CLARIO преку вистинскиот API (со најава, колачиња и улоги).
// Се извршува врз тест-серверот (празна база во меморија) — НИКОГАШ врз вистинската апликација:
//   1) npm run test:server     2) во друг терминал: npm run test:api
// Тестот очекува свежо стартуван тест-сервер (броевите на фактури и залихите почнуваат од почеток).
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE = process.env.BASE || 'http://127.0.0.1:4100';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error('Тестовите се извршуваат само врз локален тест-сервер (127.0.0.1 / localhost).');
  process.exit(2);
}
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@clario.mk', password: process.env.ADMIN_PASSWORD || 'AdminLozinka1' };
const EMAIL_FILE = process.env.EMAIL_FILE || path.join(os.tmpdir(), 'clario-test-last-email.json');

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Skopje' });
const day = (n = 0) => fmt.format(new Date(Date.now() - n * 86400000));
const TODAY = day(0);

let passed = 0; const failures = []; const notes = [];
let section = '';
const sec = (s) => { section = s; console.log(`\n── ${s}`); };
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${section}: ${name} ${extra}`); console.log(`  ✗ ${name} ${extra}`); }
};
const eq = (a, b, name) => ok(a === b, name, `(добиено: ${JSON.stringify(a)}, очекувано: ${JSON.stringify(b)})`);
const near = (a, b, name, tol = 0.011) => ok(Math.abs(Number(a) - Number(b)) <= tol, name, `(добиено: ${a}, очекувано: ${b})`);

function session() {
  let cookie = '';
  const call = async (method, path, body) => {
    const r = await fetch(BASE + '/api' + path, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.getSetCookie?.() || [];
    for (const c of set) { if (c.startsWith('token=')) cookie = c.split(';')[0] === 'token=' ? '' : c.split(';')[0]; }
    const ct = r.headers.get('content-type') || '';
    let data = null;
    if (ct.includes('json')) data = await r.json(); else data = { _bytes: (await r.arrayBuffer()).byteLength, _type: ct };
    return { status: r.status, data };
  };
  return { call, get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), put: (p, b) => call('PUT', p, b ?? {}), del: (p, b) => call('DELETE', p, b), hasCookie: () => !!cookie };
}

const admin = session(), oper = session(), anon = session();
const checklist = (date, { dead = {}, water = {} } = {}) => ({
  date,
  water_control: { temperature: 27, ph: 7.2, total_alkalinity: 100, nitrates: 20, nitrites: 0.1, hardness: 150, total_chlorine: 0, ammonium: 0.2, water_exchange_m3: 5, ...water },
  filtration_checks: { bio_filter_level: true, bio_filter_foam: 'no', mechanical_filter: true, circulation_pump: true, thermo_pump: true, aeration: true, sieve_filter: true, notes: '' },
  fish_visual: { normal_swimming: true, no_infection: true, normal_appetite: true, notes: '' },
  pool_feeding: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ pool_number: n, dead_count: dead[n] || 0 })),
  activities: {},
});

// ═══════════════ 1. НАЈАВА И УЛОГИ ═══════════════
sec('1. Најава, одјава, улоги');
let r = await anon.get('/auth/me'); eq(r.status, 401, 'без најава /auth/me → 401');
for (const p of ['/records', '/sales', '/production', '/food-inventory', '/pool-measurements', '/users', '/reports/sales-analytics?from=2026-01-01&to=2026-12-31', '/ai/recommendations', '/buyers', '/alerts', '/norms', '/meals?date=' + TODAY, '/documents/invoice/1']) {
  r = await anon.get(p); if (r.status !== 401) ok(false, `без најава ${p} → 401`, `(добиено ${r.status})`);
}
ok(true, 'сите главни адреси бараат најава');
r = await admin.post('/auth/login', { email: ADMIN.email, password: 'pogresna-lozinka' }); eq(r.status, 401, 'погрешна лозинка → 401');
r = await admin.post('/auth/login', ADMIN); eq(r.status, 200, 'админ најава');
eq(r.data.user?.role, 'admin', 'улога = admin');
r = await admin.get('/auth/me'); eq(r.data.user?.email, ADMIN.email, '/auth/me го враќа најавениот');

r = await admin.post('/users', { email: 'operator@clario.mk', full_name: 'Оператор Тест', password: 'kratka', role: 'operator' }); eq(r.status, 400, 'кратка лозинка за нов корисник → 400');
r = await admin.post('/users', { email: 'operator@clario.mk', full_name: 'Оператор Тест', password: 'OperLozinka1', role: 'operator' }); eq(r.status, 201, 'креиран оператор');
const operId = r.data.user?.id;
r = await admin.post('/users', { email: 'operator@clario.mk', full_name: 'Дупликат', password: 'OperLozinka1' }); eq(r.status, 400, 'иста е-пошта двапати → 400');
r = await oper.post('/auth/login', { email: 'operator@clario.mk', password: 'OperLozinka1' }); eq(r.status, 200, 'оператор најава');

// оператор: забрани
const forbid = async (name, p) => { const x = await p; eq(x.status, 403, `оператор: ${name} → 403`); };
await forbid('листа на корисници', oper.get('/users'));
await forbid('нов корисник', oper.post('/users', { email: 'x@x.mk', full_name: 'X', password: '12345678' }));
await forbid('внес на мерење', oper.post('/pool-measurements/batch', { measured_at: TODAY, measurements: [{ pool_number: 1, fish_count: 1, avg_weight_gr: 1 }] }));
await forbid('набавка на храна', oper.post('/food-inventory/purchase', { items: [{ food_type: 'Advance (1.5mm)', quantity_kg: 1 }] }));
await forbid('промена на норма', oper.put('/norms/1', { min_value: 1, max_value: 2 }));

// ═══════════════ 2. ШИФРАРНИЦИ ═══════════════
sec('2. Норми, типови производи, купувачи');
r = await admin.get('/norms'); ok(r.status === 200 && (r.data.norms || r.data).length > 0, 'норми се вчитуваат');
const norms = r.data.norms || r.data;
const tempNorm = norms.find(n => n.parameter_name === 'temperature') || norms[0];
r = await admin.put('/norms/' + tempNorm.id, { min_value: 30, max_value: 20 }); eq(r.status, 400, 'норма: мин ≥ макс → 400');
r = await admin.put('/norms/' + tempNorm.id, { min_value: tempNorm.min_value, max_value: tempNorm.max_value }); eq(r.status, 200, 'норма: зачувување');

r = await admin.get('/product-types'); const types = (r.data.types || r.data.product_types || r.data.productTypes || r.data).filter(t => t.is_active !== false);
ok(types.length >= 7, `типови производи (${types.length})`);
const P = Object.fromEntries(types.map(t => [t.code, t.id]));
ok(P['РБГ'] && P['ФСК'] && P['ЦР'], 'постојат РБГ, ФСК, ЦР');

r = await admin.post('/buyers', { name: '' }); eq(r.status, 400, 'купувач без име → 400');
r = await admin.post('/buyers', { name: 'Ресторан Тест ДООЕЛ', address: 'ул. Тест 1, Велес', edb: '4004000000001' }); ok([200, 201].includes(r.status), 'нов купувач (фирма)');
const buyerA = r.data.id;
r = await admin.post('/buyers', { name: '  ресторан тест дооел ' }); eq(r.data.id, buyerA, 'исто име (други букви/празни места) → ист купувач, без дупликат');
r = await admin.post('/buyers', { name: 'Петар Петров', is_individual: true }); const buyerB = r.data.id; ok(!!buyerB, 'нов купувач (физичко лице)');
r = await admin.put('/buyers/' + buyerA, { name: 'Ресторан Тест ДООЕЛ', address: 'ул. Нова 2, Велес', edb: '4004000000001' }); eq(r.data.address, 'ул. Нова 2, Велес', 'уредување купувач');
r = await admin.get('/buyers'); ok((r.data.buyers || []).length >= 2, 'листа на купувачи');

// ═══════════════ 3. МЕРЕЊЕ / СОРТИРАЊЕ ═══════════════
sec('3. Мерење / сортирање');
const all8 = (vals) => [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ pool_number: n, fish_count: vals[n]?.[0] ?? '', avg_weight_gr: vals[n]?.[1] ?? '' }));
r = await admin.post('/pool-measurements/batch', { measured_at: '2031-01-01', measurements: all8({ 1: [10, 10] }) }); eq(r.status, 400, 'мерење во иднина → 400');
r = await admin.post('/pool-measurements/batch', { measured_at: day(10), measurements: all8({ 1: [300, ''] }) }); eq(r.status, 400, 'број без тежина → 400');
r = await admin.post('/pool-measurements/batch', { measured_at: day(10), measurements: all8({ 1: [-5, 100] }) }); eq(r.status, 400, 'негативен број → 400');
r = await admin.post('/pool-measurements/batch', { measured_at: day(10), measurements: all8({ 1: [400, 150], 2: [350, 300], 3: [300, 600], 4: [200, 20] }) }); eq(r.status, 201, 'сортирање пред 10 дена (4 базени со риби, 4 празни)');
r = await admin.post('/pool-measurements/batch', { measured_at: day(10), measurements: all8({ 1: [400, 155], 2: [350, 300], 3: [300, 600], 4: [200, 20] }) }); eq(r.status, 201, 'повторно зачувување ист датум (поправка на тежина Б1)');
r = await admin.get('/pool-measurements/history/1'); eq((r.data.measurements || []).length, 1, 'Б1 има само едно мерење за тој датум (без дупликат)');
near(r.data.measurements[0].avg_weight_gr, 155, 'поправената тежина е зачувана');
r = await admin.get('/pool-measurements/by-date?date=' + day(10)); eq((r.data.measurements || []).length, 8, 'по датум: 8 базени');
r = await admin.get('/pool-fish-inventory'); const inv0 = Object.fromEntries(r.data.inventory.map(i => [i.pool_number, i.current_count]));
ok(inv0[1] === 400 && inv0[2] === 350 && inv0[3] === 300 && inv0[4] === 200 && inv0[5] === 0, 'број на риби по базен = мерењето');
r = await admin.get('/pool-measurements'); ok(r.data.measurements.find(m => m.pool_number === 1)?.projected_weight_gr >= 155, 'проектирана тежина ≥ измерена');
r = await oper.get('/pool-measurements'); eq(r.status, 200, 'оператор може да ги гледа мерењата');

// ═══════════════ 4. ДНЕВНА ЧЕКЛИСТА ═══════════════
sec('4. Дневна чеклиста');
r = await oper.post('/records', checklist(day(3), { dead: { 1: 4, 2: 1 } })); eq(r.status, 201, 'оператор: чеклиста пред 3 дена (4 угинати Б1, 1 Б2)');
const rec3 = r.data.record?.id;
r = await oper.post('/records', checklist(day(3))); eq(r.status, 409, 'втора чеклиста за ист датум → 409');
r = await oper.post('/records', checklist(day(2), { dead: { 1: -3 } })); eq(r.status, 400, 'негативни угинати → 400');
r = await oper.post('/records', checklist(day(2), { dead: { 1: 1.5 } })); eq(r.status, 400, 'децимални угинати → 400');
r = await oper.post('/records', checklist('2031-05-05')); eq(r.status, 400, 'датум во иднина → 400');
r = await oper.post('/records', { date: 'не-датум' }); eq(r.status, 400, 'невалиден датум → 400');
r = await oper.post('/records', checklist(day(2), { dead: { 1: 2 }, water: { temperature: 35, ph: 5.5, nitrites: 3 } })); eq(r.status, 201, 'чеклиста пред 2 дена со параметри надвор од норма');
const rec2 = r.data.record?.id;
ok((r.data.alerts || []).length >= 2, `креирани се аларми за надвор од норма (${(r.data.alerts || []).length})`);
r = await oper.get('/records/' + rec2); ok(r.status === 200 && r.data.pool_feeding?.length === 8 && r.data.water_control, 'детали на чеклиста');
near(r.data.pool_feeding.find(p => p.pool_number === 1).fish_count, 400 - 4, 'снимен број риби Б1 на тој ден (400 − 4 од претходниот ден)', 0);
r = await oper.put('/records/' + rec2, checklist(day(3))); eq(r.status, 409, 'уредување: промена на датум на веќе зафатен ден → 409');
r = await oper.put('/records/' + rec2, checklist(day(2), { dead: { 1: 3 } })); eq(r.status, 200, 'уредување: 3 угинати наместо 2');
r = await admin.get('/pool-fish-inventory'); eq(r.data.inventory.find(i => i.pool_number === 1).current_count, 400 - 4 - 3, 'Б1 = 400 − 4 − 3 = 393');
eq(r.data.inventory.find(i => i.pool_number === 2).current_count, 349, 'Б2 = 350 − 1 = 349');
r = await oper.get('/records?limit=10'); ok((r.data.records || []).length === 2, 'листа на чеклисти');
r = await oper.get('/records/calendar?month=' + TODAY.slice(0, 7)); eq(r.status, 200, 'календар');
r = await oper.get('/records/streak'); eq(r.status, 200, 'низа на денови');
r = await oper.del('/records/' + rec3); eq(r.status, 403, 'оператор: бришење чеклиста → 403');
r = await admin.get('/alerts'); const alerts = r.data.alerts || r.data; ok(alerts.length >= 2, 'аларми се во листата');
r = await admin.put(`/alerts/${alerts[0].id}/acknowledge`); eq(r.status, 200, 'потврдување аларм');
r = await admin.put('/alerts/acknowledge-all'); eq(r.status, 200, 'потврди ги сите аларми');

// ═══════════════ 5. ХРАНА: НАБАВКА, ОБРОЦИ, ПОПИС ═══════════════
sec('5. Храна: набавка, оброци, попис');
const FT = 'SpecialPro EF (4.5mm)', FT3 = 'SpecialPro EF (3mm)';
const stock = async (type = FT) => parseFloat((await admin.get('/food-inventory')).data.inventory.find(i => i.food_type === type)?.quantity_kg ?? 0);
// почетна состојба со попис (базата има стари записи од миграциите)
r = await admin.post('/food-inventory/census', { census_date: day(9), items: [{ food_type: FT, quantity_kg: 0 }, { food_type: FT3, quantity_kg: 0 }] }); eq(r.status, 200, 'попис: нула за двата типа (пред 9 дена)');
near(await stock(), 0, 'залиха по попис = 0');
r = await admin.post('/food-inventory/purchase', { purchase_date: day(8), supplier: 'Coppens', document_number: 'Ф-100', items: [{ food_type: FT, quantity_kg: 500 }, { food_type: FT3, quantity_kg: 100 }] }); eq(r.status, 200, 'набавка 500 kg + 100 kg');
r = await admin.post('/food-inventory/purchase', { items: [{ food_type: FT, quantity_kg: -5 }] }); eq(r.status, 400, 'негативна набавка → 400');
near(await stock(), 500, 'залиха = 500');
const meal = (date, type, grams) => ({ date, meal_type: type, pools: [1, 2, 3].map(n => ({ pool_number: n, foods: [{ food_type: n === 1 ? FT3 : FT, food_quantity_gr: grams }] })) });
r = await oper.post('/meals', meal(day(3), 'breakfast', 2000)); eq(r.status, 201, 'оброк (појадок) пред 3 дена: 3 базени × 2 kg');
r = await oper.post('/meals', meal(day(3), 'lunch', 2000)); eq(r.status, 201, 'ручек');
r = await oper.post('/meals', meal(day(3), 'dinner', 2000)); eq(r.status, 201, 'вечера');
near(await stock(), 500 - 12, 'залиха 4.5mm = 500 − 12 (Б2+Б3 × 3 оброци × 2 kg)');
near(await stock(FT3), 100 - 6, 'залиха 3mm = 100 − 6');
r = await oper.post('/meals', meal(day(3), 'dinner', 3000)); eq(r.status, 201, 'поправка на вечерата (3 kg наместо 2)');
near(await stock(), 500 - 14, 'залихата ја следи поправката (не се одзема двапати)');
r = await oper.post('/meals', { date: day(3), meal_type: 'brunch', pools: [] }); eq(r.status, 400, 'непознат оброк → 400');
r = await oper.post('/meals', { date: TODAY, meal_type: 'lunch', pools: [{ pool_number: 1, foods: [{ food_type: '', food_quantity_gr: 500 }] }] }); eq(r.status, 400, 'количина без тип храна → 400');
r = await oper.post('/meals', { date: '2031-01-01', meal_type: 'lunch', pools: [] }); eq(r.status, 400, 'оброк во иднина → 400');
r = await oper.get('/meals?date=' + day(3)); eq(r.status, 200, 'преглед на оброци за ден');
r = await oper.get('/meals/status?date=' + day(3)); eq(r.status, 200, 'статус на оброци');
r = await oper.del(`/meals?date=${day(3)}&meal_type=lunch`); eq(r.status, 200, 'бришење оброк (ручек)');
near(await stock(), 500 - 10, 'залихата се врати по бришење на ручекот');
// попис со минат датум
r = await oper.post('/food-inventory/census', { census_date: day(5), items: [{ food_type: FT, quantity_kg: 480 }] }); eq(r.status, 200, 'оператор: попис пред 5 дена = 480 kg');
near(await stock(), 480 - 10, 'залиха = 480 (на тој датум) − 10 потрошено потоа');
r = await admin.get('/food-inventory/log?days=30'); const flog = r.data.log || r.data.entries || r.data; eq(r.status, 200, 'дневник на храна');
const censusRow = (Array.isArray(flog) ? flog : []).find(e => e.supplier === 'Попис');
const purchRow = (Array.isArray(flog) ? flog : []).find(e => e.supplier === 'Coppens' && e.food_type === FT);
if (censusRow) { r = await admin.put('/food-inventory/purchase/' + censusRow.id, { quantity_kg: 20 }); eq(r.status, 400, 'уредување на запис од попис → 400'); } else ok(false, 'пронајден запис од попис во дневникот');
if (purchRow) {
  r = await admin.put('/food-inventory/purchase/' + purchRow.id, { quantity_kg: 510 }); eq(r.status, 200, 'уредување набавка 500 → 510');
  // набавката е пред пописот (ден −8 < ден −5), па пописот останува меродавен
  near(await stock(), 470 + 10, 'залиха +10 по корекцијата на набавката');
  r = await admin.put('/food-inventory/purchase/' + purchRow.id, { quantity_kg: 500 }); near(await stock(), 470, 'вратено на 500');
} else ok(false, 'пронајдена набавка во дневникот');
r = await admin.get('/food-inventory/projection'); ok(r.status === 200 && Array.isArray(r.data.projections), 'проекција на залиха (денови)');
r = await admin.get('/meals/history?from=' + day(7) + '&to=' + TODAY); eq(r.status, 200, 'историја на оброци');

// ═══════════════ 6. ПРОИЗВОДСТВО ═══════════════
sec('6. Производство (серии, ЛОТ, залиха на производи)');
// почетна залиха на производи = 0 (базата има почетен попис од миграциите)
r = await admin.put('/production/inventory/reset', { items: Object.values(P).map(id => ({ product_type_id: id, quantity_kg: 0 })) }); eq(r.status, 200, 'попис на производи: сè на 0');
const batch = (date, pool, fish, weight, items) => ({ production_date: date, source_pool: pool, fish_count: fish, total_weight_kg: weight, complete: true, items });
r = await oper.post('/production', batch('2031-01-01', 3, 10, 6, [])); eq(r.status, 400, 'серија во иднина → 400');
r = await oper.post('/production', batch(day(2), 9, 10, 6, [])); eq(r.status, 400, 'базен 9 → 400');
r = await oper.post('/production', batch(day(2), 3, -1, 6, [])); eq(r.status, 400, 'негативен број риби → 400');
r = await oper.post('/production', batch(day(2), 3, 50, 30, [{ product_type_id: P['РБГ'], quantity_kg: 12.5 }, { product_type_id: P['ФСК'], quantity_kg: 6.25 }])); eq(r.status, 201, 'серија А: Б3, 50 риби, РБГ 12.5 + ФСК 6.25');
const batchA = r.data; const yymmdd = day(2).slice(2).replace(/-/g, '');
eq(batchA.lot_number, `${yymmdd}-3`, 'ЛОТ = ГГММДД-базен');
r = await oper.post('/production', batch(day(2), 3, 20, 12, [{ product_type_id: P['РБГ'], quantity_kg: 5 }])); eq(r.status, 201, 'серија Б: ист базен ист ден');
const batchB = r.data; eq(batchB.lot_number, `${yymmdd}-3-2`, 'втора серија добива наставка -2');
r = await oper.post('/production', batch(day(1), 2, 30, 9, [{ product_type_id: P['РБГ'], quantity_kg: 4 }])); const batchC = r.data; eq(r.status, 201, 'серија В: Б2 вчера, РБГ 4');
r = await admin.get('/pool-fish-inventory'); eq(r.data.inventory.find(i => i.pool_number === 3).current_count, 300 - 70, 'Б3 = 300 − 50 − 20 = 230');
eq(r.data.inventory.find(i => i.pool_number === 2).current_count, 349 - 30, 'Б2 = 349 − 30 = 319');
const prodInv = async () => { const x = await admin.get('/production/inventory'); return Object.fromEntries((x.data.inventory || []).map(i => [i.code, parseFloat(i.quantity_kg)])); };
let pi = await prodInv(); near(pi['РБГ'], 21.5, 'залиха РБГ = 12.5 + 5 + 4 = 21.5'); near(pi['ФСК'], 6.25, 'залиха ФСК = 6.25');
r = await oper.put('/production/' + batchC.id, batch(day(1), 2, 30, 9, [{ product_type_id: P['РБГ'], quantity_kg: 4.5 }])); eq(r.status, 200, 'уредување серија В: РБГ 4 → 4.5');
pi = await prodInv(); near(pi['РБГ'], 22, 'залиха РБГ = 22');
r = await oper.get('/production'); ok((r.data.batches || r.data).length >= 3, 'листа на серии');
r = await oper.get('/production/' + batchA.id); eq(r.status, 200, 'детали на серија');
r = await oper.del('/production/' + batchC.id); eq(r.status, 403, 'оператор: бришење серија → 403');

// ═══════════════ 7. ПРОДАЖБИ ═══════════════
sec('7. Продажби, броеви на документи, ДДВ, FIFO');
const sale = (o) => ({ buyer_id: buyerA, sale_date: day(1), payment_method: 'фактура', vat_rate: 5, due_date: day(-6), transport_vehicle: 'VE-8779-AF', packaging: 'Кеси', ...o });
r = await oper.post('/sales', sale({ items: [] })); eq(r.status, 400, 'продажба без ставки → 400');
r = await oper.post('/sales', sale({ buyer_id: null, items: [{ product_type_id: P['РБГ'], quantity_kg: 1, price_per_kg: 1 }] })); eq(r.status, 400, 'без купувач → 400');
r = await oper.post('/sales', sale({ items: [{ product_type_id: P['РБГ'], quantity_kg: -1, price_per_kg: 300 }] })); eq(r.status, 400, 'негативна количина → 400');
r = await oper.post('/sales', sale({ items: [{ product_type_id: P['РБГ'], quantity_kg: 100, price_per_kg: 300 }] })); eq(r.status, 400, 'повеќе од залихата → 400');
ok(/залиха/i.test(r.data.error || ''), 'пораката кажува дека нема залиха');
// S1: фактура, автоматски FIFO низ два ЛОТ-а, два реда од ист производ
r = await oper.post('/sales', sale({ items: [{ product_type_id: P['РБГ'], quantity_kg: 10, price_per_kg: 385 }, { product_type_id: P['РБГ'], quantity_kg: 4.333, price_per_kg: 400 }, { product_type_id: P['ФСК'], quantity_kg: 2, price_per_kg: 650 }] }));
eq(r.status, 201, 'S1: фактура (РБГ 10 @385, РБГ 4.333 @400, ФСК 2 @650)');
const S1 = r.data; const sufx = day(1).slice(2).replace(/-/g, '');
eq(S1.invoice_number, `001-${sufx}`, 'број на фактура 001-ГГММДД'); eq(S1.dispatch_number, `И-001-${sufx}`, 'број на испратница И-001-ГГММДД');
near(S1.subtotal, 10 * 385 + 1733.2 + 1300, 'основица = 3850 + 1733.20 + 1300 = 6883.20');
near(S1.vat_amount, 344.16, 'ДДВ 5% = 344.16'); near(S1.total, 7227.36, 'вкупно = 7227.36');
eq(S1.payment_status, 'неплатено', 'фактура = неплатено');
r = await oper.get('/sales/' + S1.id); const s1items = r.data.items;
near(s1items.reduce((a, i) => a + parseFloat(i.amount), 0), parseFloat(S1.subtotal), 'збир на ставките = основица');
ok(s1items.filter(i => i.code === 'РБГ').length >= 3, 'РБГ е поделен по ЛОТ-ови (FIFO)');
near(s1items.filter(i => i.code === 'РБГ' && i.lot_number === batchA.lot_number).reduce((a, i) => a + parseFloat(i.quantity_kg), 0), 12.5, 'најстариот ЛОТ е испразнет прв (12.5 kg)');
pi = await prodInv(); near(pi['РБГ'], 22 - 14.333, 'залиха РБГ по S1'); near(pi['ФСК'], 4.25, 'залиха ФСК по S1');
// S2: готово → без ДДВ, платено, серија Г
r = await oper.post('/sales', sale({ buyer_id: buyerB, payment_method: 'готово', due_date: null, items: [{ product_type_id: P['ФСК'], quantity_kg: 1.5, price_per_kg: 700 }] }));
eq(r.status, 201, 'S2: готово'); const S2 = r.data;
eq(S2.invoice_number, `Г-001-${sufx}`, 'готово има своја серија Г-001'); near(S2.vat_amount, 0, 'готово: ДДВ 0'); near(S2.total, 1050, 'готово: вкупно 1050'); eq(S2.payment_status, 'платено', 'готово = платено');
// S3: гратис
r = await oper.post('/sales', sale({ buyer_id: buyerB, payment_method: 'гратис', due_date: null, items: [{ product_type_id: P['ФСК'], quantity_kg: 0.5, price_per_kg: 0 }] }));
eq(r.data.invoice_number, `ГР-001-${sufx}`, 'S3: гратис има серија ГР-001'); const S3 = r.data;
// S4: без ЛОТ (стара продажба) — не одзема залиха
pi = await prodInv(); const beforeNoLot = pi['РБГ'];
r = await oper.post('/sales', sale({ sale_date: day(40), due_date: day(33), items: [{ product_type_id: P['РБГ'], quantity_kg: 50, price_per_kg: 350, no_lot: true }] }));
eq(r.status, 201, 'S4: стара продажба без ЛОТ (пред 40 дена)'); const S4 = r.data;
pi = await prodInv(); near(pi['РБГ'], beforeNoLot, 'без ЛОТ → залихата не се менува');
eq(S4.invoice_number.slice(0, 3), '002', 'втора фактура во годината = 002');
// S5: избран ЛОТ
r = await oper.post('/sales', sale({ items: [{ product_type_id: P['РБГ'], quantity_kg: 2, price_per_kg: 390, lot_number: batchC.lot_number }] })); eq(r.status, 201, 'S5: со избран ЛОТ'); const S5 = r.data;
r = await oper.post('/sales', sale({ items: [{ product_type_id: P['РБГ'], quantity_kg: 99, price_per_kg: 390, lot_number: batchC.lot_number }] })); eq(r.status, 400, 'избран ЛОТ без доволно залиха → 400');
// уредување
r = await oper.put('/sales/' + S5.id, sale({ items: [{ product_type_id: P['РБГ'], quantity_kg: 1, price_per_kg: 390, lot_number: batchC.lot_number }] })); eq(r.status, 200, 'уредување S5: 2 → 1 kg');
pi = await prodInv(); near(pi['РБГ'], beforeNoLot - 1, 'залихата ја следи измената');
r = await oper.put('/sales/' + S5.id, sale({ sale_date: day(0), items: [{ product_type_id: P['РБГ'], quantity_kg: 1, price_per_kg: 390, lot_number: batchC.lot_number }] }));
eq(r.data.invoice_number, `${S5.invoice_number.slice(0, 3)}-${TODAY.slice(2).replace(/-/g, '')}`, 'промена на датум → бројот го следи датумот, редниот број останува');
r = await oper.put('/sales/' + S2.id, sale({ buyer_id: buyerB, payment_method: 'фактура', items: [{ product_type_id: P['ФСК'], quantity_kg: 1.5, price_per_kg: 700 }] }));
ok(r.data.payment_status === 'неплатено' && !/^Г-/.test(r.data.invoice_number) && Math.abs(r.data.vat_amount - 52.5) < 0.011, 'готово → фактура: неплатено, нов број од серијата фактури, ДДВ 5%');
// плаќање
r = await oper.put(`/sales/${S1.id}/payment`, { paid: true, paid_at: TODAY }); eq(r.data.payment_status, 'платено', 'означи S1 платено');
r = await oper.put(`/sales/${S1.id}/payment`, { paid: false }); ok(r.data.payment_status === 'неплатено' && r.data.paid_at == null, 'врати S1 на неплатено');
// серија со продажба не смее да се намали под продаденото / да се избрише
r = await admin.put('/production/' + batchA.id, batch(day(2), 3, 50, 30, [{ product_type_id: P['РБГ'], quantity_kg: 5 }, { product_type_id: P['ФСК'], quantity_kg: 6.25 }])); eq(r.status, 400, 'серија А: РБГ под продаденото (12.5) → 400');
r = await admin.del('/production/' + batchA.id); eq(r.status, 400, 'бришење серија со продажба → 400');
r = await admin.put('/production/' + batchA.id, batch(day(2), 4, 50, 30, [{ product_type_id: P['РБГ'], quantity_kg: 12.5 }, { product_type_id: P['ФСК'], quantity_kg: 6.25 }])); eq(r.status, 200, 'серија А: промена на базен 3 → 4');
r = await oper.get('/sales/' + S1.id); ok(r.data.items.some(i => i.lot_number === `${yymmdd}-4`) && !r.data.items.some(i => i.lot_number === batchA.lot_number), 'новиот ЛОТ број е пренесен во продажбата');
// листа и бришење
r = await oper.get('/sales?limit=5000'); eq((r.data.sales || []).length, 5, 'листа: 5 продажби');
r = await oper.del('/sales/' + S3.id); eq(r.status, 403, 'оператор: бришење продажба → 403');
pi = await prodInv(); const fskBefore = pi['ФСК'];
r = await admin.del('/sales/' + S3.id); eq(r.status, 200, 'админ: бришење S3');
pi = await prodInv(); near(pi['ФСК'], fskBefore + 0.5, 'залихата е вратена по бришење');
r = await admin.del('/sales/' + S3.id); eq(r.status, 404, 'повторно бришење → 404');

// ═══════════════ 8. ДОКУМЕНТИ (PDF) ═══════════════
sec('8. Документи');
for (const t of ['invoice', 'declaration', 'commercial', 'origin']) {
  r = await oper.get(`/documents/${t}/${S1.id}`);
  ok(r.status === 200 && /pdf/.test(r.data._type || '') && r.data._bytes > 20000, `${t}: PDF (${r.data._bytes} бајти)`);
}
r = await oper.get('/documents/invoice/999999'); eq(r.status, 404, 'документ за непостоечка продажба → 404');
r = await oper.get('/documents/nepoznat/' + S1.id); ok([400, 404].includes(r.status), 'непознат тип документ → грешка');
r = await oper.get('/documents/invoice/' + S4.id); eq(r.status, 200, 'фактура за продажба без ЛОТ');

// ═══════════════ 9. ИЗВЕШТАИ ═══════════════
sec('9. Извештаи');
const from = day(60), to = TODAY;
r = await admin.get(`/reports/sales-analytics?from=${from}&to=${to}`);
ok(r.status === 200 && r.data.current.length === 4 && r.data.monthly.length === 12, 'аналитика на продажби: 4 продажби, 12 месеци');
r = await admin.get(`/reports/sales-detail?from=${from}&to=${to}`);
ok(r.status === 200 && r.data.rows.length === 4, 'преглед по фактура: 4 реда (еден по фактура)');
near(r.data.totals.amount, r.data.rows.reduce((a, x) => a + x.total, 0), 'вкупно = збир на редовите');
near(r.data.totals.paid + r.data.totals.unpaid, r.data.totals.amount, 'платено + неплатено = вкупно');
r = await admin.get(`/reports/sales-detail?from=${from}&to=${to}&buyer_id=${buyerA}`); ok(r.data.rows.every(x => x.buyer_name === 'Ресторан Тест ДООЕЛ') && r.data.rows.length === 3, 'филтер по купувач');
r = await admin.get(`/reports/sales-detail?from=${from}&to=${to}&paid=unpaid`); ok(r.data.rows.every(x => !x.paid), 'филтер неплатени');
r = await admin.get(`/reports/sales-detail?from=${from}&to=${to}&product_type_id=${P['ФСК']}`); ok(r.data.rows.length === 2 && r.data.rows.every(x => x.items.every(i => i.code === 'ФСК')), 'филтер по производ');
r = await admin.get(`/reports/sales-detail/pdf?from=${from}&to=${to}`); ok(r.status === 200 && /pdf/.test(r.data._type), 'PDF на меморандум');
r = await admin.get(`/reports/sales-detail`); eq(r.status, 400, 'без период → 400');
const reps = [
  ['production', { from, to }], ['food-consumption', { from, to }], ['avg-weight', {}], ['alerts', { from, to }],
  ['sorting', { from, to }], ['food-purchases', { from, to }], ['inventory', {}],
];
for (const [name, body] of reps) { r = await admin.post('/reports/' + name, body); eq(r.status, 200, `преглед: ${name}`); }
r = await admin.post('/reports/production', { from, to }); near(r.data.totalFish, 100, 'производство: вкупно 100 риби', 0); near(r.data.totalProcessedKg, 28.25, 'производство: 28.25 kg производи');
r = await admin.post('/reports/food-consumption', { from, to }); const fc = (r.data.data || []).find(d => d.food_type === FT);
near((fc?.total_gr || 0) / 1000, 10, 'потрошена храна 4.5mm = 10 kg'); near(fc?.purchased_kg, 500, 'набавено во период = 500 (без попис)'); near(fc?.remaining_kg, 470, 'залиха сега = 470 (иста како на екранот)');
r = await admin.post('/reports/inventory', {}); near(r.data.inventory.find(i => i.food_type === FT).quantity_kg, 470, 'извештај залихи = иста залиха како на екранот');
r = await admin.get('/reports/measurement-dates'); ok((r.data.dates || r.data).length >= 1, 'датуми на мерења');
// е-пошта (сервисот е заменет со запис во датотека)
for (const [name, body] of reps) {
  try { fs.unlinkSync(EMAIL_FILE); } catch { /* нема */ }
  r = await admin.post('/reports/' + name, { ...body, sendEmail: true });
  ok(r.status === 200 && fs.existsSync(EMAIL_FILE), `испраќање по е-пошта: ${name}`, `(статус ${r.status} ${JSON.stringify(r.data).slice(0, 80)})`);
}
r = await admin.post('/reports/daily/' + rec2, {}); ok([200, 201].includes(r.status), 'дневен извештај по е-пошта');

// ═══════════════ 10. ПРЕПОРАКИ (ML) ═══════════════
sec('10. Препораки за хранење и анализа на вода');
r = await oper.get('/ai/recommendations'); eq(r.status, 200, 'препораки за сите базени');
const rp = r.data.pools;
ok(rp[1].hasData && rp[1].recommendation.stockFoodType === FT3, `Б1 (≈155 g) → ${rp[1].recommendation?.stockFoodType}`);
ok(rp[2].recommendation.stockFoodType === FT, `Б2 (≈300 g) → ${rp[2].recommendation?.stockFoodType}`);
ok(rp[4].recommendation.stockFoodType === 'Pregrower-15 (2mm)', `Б4 (≈20 g) → ${rp[4].recommendation?.stockFoodType}`);
ok(rp[5].hasData === false, 'празен базен → без препорака');
ok(!JSON.stringify(r.data).includes('Grower-13'), 'нема Grower-13 во препораките');
r = await oper.get('/ai/pool/2'); eq(r.status, 200, 'препорака за еден базен');
r = await oper.post('/ai/calculate', { fishCount: 1000, avgWeight: 300, temperature: 27 }); near(r.data.recommendation?.dailyFoodGr, 7200, 'калкулатор: 1000 риби × 300 g → 7200 g/ден (2.4%)', 60);
r = await oper.post('/ai/calculate', { fishCount: 1000, avgWeight: 12.9, temperature: 27 }); eq(r.data.recommendation?.stockFoodType, 'Advance (1.5mm)', '12.9 g → Advance');
r = await oper.post('/ai/calculate', { fishCount: 1000, avgWeight: 58, temperature: 27 }); eq(r.data.recommendation?.stockFoodType, FT3, '58 g → SpecialPro 3mm');
r = await oper.post('/ai/calculate', { fishCount: 1000, avgWeight: 184, temperature: 27 }); eq(r.data.recommendation?.stockFoodType, FT, '184 g → SpecialPro 4.5mm');
r = await oper.post('/ai/calculate', { fishCount: 1000, avgWeight: 300, temperature: 15 }); eq(r.data.recommendation?.dailyFoodGr, 0, 'вода 15°C → не се храни');
r = await oper.post('/ai/calculate', { fishCount: 0, avgWeight: 300 }); ok(r.status === 400 && /риби/.test(r.data.error), '0 риби → јасна порака');
r = await oper.get('/ai/feeding-table'); eq(r.status, 200, 'табела за хранење');
r = await oper.get('/ai/water-prediction'); eq(r.status, 200, 'анализа на вода');
ok((r.data.warnings || []).some(w => w.type === 'exceeded') || r.data.isStable === false || r.data.hasData === false || r.data.insufficientData, 'параметар над норма не се прикажува како „стабилно“');
r = await oper.get('/ai/growth-history/1'); eq(r.status, 200, 'историја на раст');

// ═══════════════ 11. КОРИСНИЦИ: УЛОГА, ЛОЗИНКА, ДЕАКТИВИРАЊЕ ═══════════════
sec('11. Корисници: промена на улога, лозинка, бришење');
r = await admin.put('/users/' + operId, { role: 'admin' }); eq(r.status, 200, 'оператор → админ');
r = await oper.get('/users'); eq(r.status, 200, 'промената важи веднаш, без повторна најава');
r = await admin.put('/users/' + operId, { role: 'operator' }); r = await oper.get('/users'); eq(r.status, 403, 'назад во оператор важи веднаш');
const me = (await admin.get('/auth/me')).data.user.id;
r = await admin.put('/users/' + me, { role: 'operator' }); eq(r.status, 400, 'админ не може сам да си ја тргне улогата');
r = await admin.del('/users/' + me); eq(r.status, 400, 'админ не може да се избрише себеси');
// заборавена лозинка
r = await anon.post('/auth/forgot-password', { email: 'nepostoi@clario.mk' }); eq(r.status, 200, 'заборавена лозинка: непозната е-пошта → ист одговор');
try { fs.unlinkSync(EMAIL_FILE); } catch { /* нема */ }
r = await anon.post('/auth/forgot-password', { email: 'operator@clario.mk' }); eq(r.status, 200, 'заборавена лозинка: испратен код');
const code = (JSON.parse(fs.readFileSync(EMAIL_FILE, 'utf8')).html.match(/>(\d{6})</) || [])[1];
ok(/^\d{6}$/.test(code || ''), 'кодот е 6 цифри во пораката');
r = await anon.post('/auth/reset-password', { email: 'operator@clario.mk', code: code === '000000' ? '111111' : '000000', newPassword: 'NovaLozinka1' }); eq(r.status, 400, 'погрешен код → 400');
r = await anon.post('/auth/reset-password', { email: 'operator@clario.mk', code, newPassword: 'NovaLozinka1' }); eq(r.status, 200, 'нова лозинка поставена');
r = await oper.get('/records'); eq(r.status, 401, 'старата најава на операторот престана да важи');
r = await oper.post('/auth/login', { email: 'operator@clario.mk', password: 'OperLozinka1' }); eq(r.status, 401, 'старата лозинка не работи');
r = await oper.post('/auth/login', { email: 'operator@clario.mk', password: 'NovaLozinka1' }); eq(r.status, 200, 'најава со новата лозинка');
// бришење корисник со внесови → деактивирање
r = await admin.del('/users/' + operId); ok(r.status === 200 && r.data.deactivated === true, 'корисник со внесови → деактивиран (не грешка)');
r = await oper.get('/records'); eq(r.status, 401, 'деактивираниот веднаш е одјавен');
r = await oper.post('/auth/login', { email: 'operator@clario.mk', password: 'NovaLozinka1' }); eq(r.status, 401, 'деактивираниот не може да се најави');
r = await admin.get('/users'); ok(!r.data.users.some(u => u.id === operId), 'го нема во листата');
r = await admin.get('/records/' + rec3); eq(r.status, 200, 'неговите чеклисти остануваат');
// бришење од админ
r = await admin.del('/records/' + rec3); eq(r.status, 200, 'админ: бришење чеклиста');
r = await admin.get('/pool-fish-inventory'); eq(r.data.inventory.find(i => i.pool_number === 1).current_count, 400 - 3, 'Б1 по бришење на чеклистата со 4 угинати = 397');
r = await admin.post('/auth/logout'); r = await admin.get('/auth/me'); eq(r.status, 401, 'одјава');

// ═══════════════ РЕЗУЛТАТ ═══════════════
console.log(`\n════════════════════════════════════\n  Поминати: ${passed}   Паднати: ${failures.length}`);
if (failures.length) { console.log('\n  ПАДНАТИ:'); failures.forEach(f => console.log('   ✗ ' + f)); }
process.exit(failures.length ? 1 : 0);
