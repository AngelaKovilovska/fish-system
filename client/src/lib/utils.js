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
