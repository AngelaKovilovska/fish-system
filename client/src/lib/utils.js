import { MK_MONTHS } from './constants';

/**
 * Форматира датум од Date објект → "7 Септември 2026"
 */
export function formatDateMK(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getDate()} ${MK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Форматира датум кратко → "7 Сеп"
 */
export function formatDateShortMK(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate()} ${MK_MONTHS[d.getMonth()].substring(0, 3)}`;
}

/**
 * Форматира датум → "07.09.2026"
 */
export function fmtDate(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * Предупредувања за залиха на производи (ниска залиха, рок на траење).
 * @param {Array} inventory - од api.getProductInventory() (со lots и min_stock_kg)
 * @returns {Array<{type:'low'|'expiring'|'expired', level:'warning'|'danger', text:string, code:string}>}
 */
export function productStockWarnings(inventory, expiringDays = 14) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  for (const item of inventory || []) {
    const qty = parseFloat(item.quantity_kg) || 0;
    const min = item.min_stock_kg != null ? parseFloat(item.min_stock_kg) : 5;
    if (min > 0 && qty < min) {
      out.push({
        type: 'low', level: qty <= 0 ? 'danger' : 'warning', code: item.code,
        text: qty <= 0 ? `${item.code} — нема залиха (праг ${min.toFixed(1)} кг)`
                       : `${item.code} — ниска залиха: ${qty.toFixed(1)} кг (праг ${min.toFixed(1)} кг)`,
      });
    }
    for (const lot of item.lots || []) {
      if (!lot.expiry_date || parseFloat(lot.quantity_kg) <= 0) continue;
      const exp = new Date(String(lot.expiry_date).slice(0, 10) + 'T00:00:00');
      const days = Math.ceil((exp - today) / 86400000);
      if (days < 0) {
        out.push({ type: 'expired', level: 'danger', code: item.code,
          text: `${item.code} LOT ${lot.lot_number} — истечен рок (${fmtDate(lot.expiry_date)}), ${parseFloat(lot.quantity_kg).toFixed(1)} кг` });
      } else if (days <= expiringDays) {
        out.push({ type: 'expiring', level: 'warning', code: item.code,
          text: `${item.code} LOT ${lot.lot_number} — истекува за ${days} ${days === 1 ? 'ден' : 'дена'} (${fmtDate(lot.expiry_date)}), ${parseFloat(lot.quantity_kg).toFixed(1)} кг` });
      }
    }
  }
  return out.sort((a, b) => (a.level === 'danger' ? 0 : 1) - (b.level === 'danger' ? 0 : 1));
}
