import db from './db.js';

// Domyślne kategorie zakładane dla każdego nowego użytkownika
export const DEFAULT_CATEGORIES = [
  // Wydatki
  { name: 'Jedzenie', type: 'expense', color: '#f97316', icon: '🛒' },
  { name: 'Mieszkanie', type: 'expense', color: '#8b5cf6', icon: '🏠' },
  { name: 'Transport', type: 'expense', color: '#0ea5e9', icon: '🚌' },
  { name: 'Rozrywka', type: 'expense', color: '#ec4899', icon: '🎬' },
  { name: 'Zdrowie', type: 'expense', color: '#10b981', icon: '💊' },
  { name: 'Ubrania', type: 'expense', color: '#f43f5e', icon: '👕' },
  { name: 'Rachunki', type: 'expense', color: '#eab308', icon: '🧾' },
  { name: 'Edukacja', type: 'expense', color: '#6366f1', icon: '📚' },
  { name: 'Inne wydatki', type: 'expense', color: '#94a3b8', icon: '📦' },
  // Przychody
  { name: 'Wynagrodzenie', type: 'income', color: '#0e9f6e', icon: '💼' },
  { name: 'Premia', type: 'income', color: '#22c55e', icon: '🎁' },
  { name: 'Odsetki', type: 'income', color: '#14b8a6', icon: '🏦' },
  { name: 'Inne przychody', type: 'income', color: '#84cc16', icon: '➕' },
];

// Zakłada domyślny zestaw kategorii (nowy użytkownik lub nowy budżet domowy)
export async function seedCategories(userId) {
  const rows = DEFAULT_CATEGORIES.map((c) => [userId, c.name, c.type, c.color, c.icon]);
  const params = rows.flat();
  const placeholders = rows
    .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
    .join(', ');
  await db.query(
    `INSERT INTO categories (user_id, name, type, color, icon) VALUES ${placeholders}`,
    params
  );
}
