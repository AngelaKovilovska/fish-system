const express = require('express');
const pool = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const { buildDocument, DOCUMENT_TYPES } = require('../lib/pdfDocuments');

const router = express.Router();

const FILE_LABELS = { invoice: 'Фактура', commercial: 'Комерцијален', declaration: 'Декларација' };

async function loadSale(id) {
  const sale = await pool.query(
    `SELECT s.*, b.name AS buyer_name, b.address AS buyer_address, b.edb AS buyer_edb,
            b.contact_person AS buyer_contact, b.phone AS buyer_phone, b.email AS buyer_email
     FROM sales s LEFT JOIN buyers b ON b.id = s.buyer_id
     WHERE s.id = $1`,
    [id]
  );
  if (sale.rows.length === 0) return null;
  const items = await pool.query(
    `SELECT si.*, pt.code, pt.name, pt.latin_name, pt.unit
     FROM sale_items si JOIN product_types pt ON pt.id = si.product_type_id
     WHERE si.sale_id = $1 ORDER BY pt.sort_order`,
    [id]
  );
  return { ...sale.rows[0], items: items.rows };
}

// GET /api/documents/:type/:saleId — официјален PDF урнек пополнет со податоци од продажбата
router.get('/:type/:saleId', authMiddleware, async (req, res) => {
  const { type, saleId } = req.params;
  if (!DOCUMENT_TYPES.includes(type)) return res.status(400).json({ error: 'Непознат тип на документ' });
  if (!/^\d+$/.test(saleId)) return res.status(400).json({ error: 'Невалиден ID' });

  try {
    const sale = await loadSale(saleId);
    if (!sale) return res.status(404).json({ error: 'Продажбата не е пронајдена' });

    const pdf = await buildDocument(type, sale);
    const num = (sale.invoice_number || sale.dispatch_number || saleId).replace(/[\s/\\:*?"<>|]/g, '_');
    const fileName = `${FILE_LABELS[type]}_${num}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (err) {
    console.error('Document build error:', err);
    res.status(500).json({ error: 'Грешка при генерирање на документот' });
  }
});

module.exports = router;
