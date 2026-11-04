import { httpError } from './http.js';

// Kwota transakcji — dodatnia, zaokrąglona do 2 miejsc
export function toAmount(v, label = 'Kwota') {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : parseFloat(v);
  if (!isFinite(n) || n <= 0) throw httpError(400, `${label} musi być liczbą większą od zera`);
  return Math.round(n * 100) / 100;
}

// Saldo początkowe konta — może być 0 lub ujemne
export function toSignedAmount(v, label = 'Saldo początkowe') {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : parseFloat(v);
  if (!isFinite(n)) throw httpError(400, `${label} musi być liczbą`);
  return Math.round(n * 100) / 100;
}

export function toIsoDate(v, label = 'Data') {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw httpError(400, `${label} musi być w formacie RRRR-MM-DD`);
  }
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) throw httpError(400, `${label} jest nieprawidłowa`);
  return v;
}

// 'RRRR-MM' -> 'RRRR-MM-01'
export function toMonth(v, label = 'Miesiąc') {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}$/.test(v)) {
    throw httpError(400, `${label} musi być w formacie RRRR-MM`);
  }
  return `${v}-01`;
}

export function toText(v, { label = 'Pole', max = 200, required = false } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) {
    if (required) throw httpError(400, `${label} jest wymagane`);
    return null;
  }
  if (s.length > max) throw httpError(400, `${label} może mieć maksymalnie ${max} znaków`);
  return s;
}

export function toId(v, label = 'Identyfikator') {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${label} jest nieprawidłowy`);
  return n;
}

export function toBool(v, label = 'Flaga') {
  if (typeof v !== 'boolean') throw httpError(400, `${label} musi być true/false`);
  return v;
}

export function round2(v) {
  return v == null ? 0 : Math.round(parseFloat(v) * 100) / 100;
}
