const pln = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
});

export function formatPLN(value) {
  return pln.format(value ?? 0);
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ---- operacje na miesiącach w formacie 'RRRR-MM' ----

export function ymNow() {
  return new Date().toISOString().slice(0, 7);
}

export function ymShift(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function ymLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pl-PL', {
    month: 'long',
    year: 'numeric',
  });
}

// ['RRRR-MM-01', 'RRRR-MM-DD'] — pierwszy i ostatni dzień miesiąca
export function ymRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
}

// Stałe kolory wykresów (SVG nie rozwiązuje zmiennych CSS)
export const COLORS = { red: '#e02d3c', green: '#0e9f6e', primary: '#635bff' };

export const ACCOUNT_TYPE_LABELS = {
  checking: 'Konto bankowe',
  savings: 'Oszczędności',
  cash: 'Gotówka',
  card: 'Karta',
  other: 'Inne',
};

export const FREQUENCY_LABELS = {
  weekly: 'Co tydzień',
  monthly: 'Co miesiąc',
};

export const ICONS = [
  '🛒', '🏠', '🚌', '🎬', '💊', '👕', '🧾', '📚', '📦', '💼', '🎁', '🏦',
  '➕', '🍔', '☕', '🐶', '✈️', '🎮', '💡', '📱',
];
