// Редни броеви на документи: [префикс]NNN-ГГММДД, редоследни по серија, се ресетираат секоја година.
//   invoice  → 001-260921     (плаќање на фактура)
//   cash     → Г-001-260921   (готово)
//   free     → ГР-001-260921  (гратис)
//   dispatch → И-001-260921   (испратница, за секоја продажба)
// `client` мора да е од отворена трансакција (броевите се доделуваат атомски).

const PREFIX = { invoice: '', cash: 'Г-', free: 'ГР-', dispatch: 'И-' };

function seriesForPayment(paymentMethod) {
  const m = String(paymentMethod || '').toLowerCase();
  if (m === 'готово') return 'cash';
  if (m === 'гратис') return 'free';
  return 'invoice';
}

function toDate(d) {
  const x = typeof d === 'string' ? new Date(d.slice(0, 10) + 'T00:00:00') : (d instanceof Date ? d : new Date());
  return isNaN(x.getTime()) ? new Date() : x;
}

function dateSuffix(d) {
  const x = toDate(d);
  return `${String(x.getFullYear()).slice(2)}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`;
}

async function nextNumber(client, series, saleDate) {
  if (!(series in PREFIX)) throw new Error(`Непозната серија: ${series}`);
  const d = toDate(saleDate);
  const r = await client.query(
    `INSERT INTO document_sequences (series, year, last_seq) VALUES ($1, $2, 1)
     ON CONFLICT (series, year) DO UPDATE SET last_seq = document_sequences.last_seq + 1
     RETURNING last_seq`,
    [series, d.getFullYear()]
  );
  const seq = r.rows[0].last_seq;
  return `${PREFIX[series]}${String(seq).padStart(3, '0')}-${dateSuffix(d)}`;
}

module.exports = { nextNumber, seriesForPayment, dateSuffix };
