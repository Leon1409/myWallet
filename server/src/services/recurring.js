import db from '../db.js';

function advanceDate(date, frequency) {
  const d = new Date(`${date}T12:00:00Z`);
  if (frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

// Tworzy zaległe transakcje z aktywnych wpisów cyklicznych.
// Zwraca liczbę utworzonych transakcji.
export async function processRecurring() {
  const today = new Date().toISOString().slice(0, 10);
  const r = await db.query(
    'SELECT id, user_id, category_id, type, amount, description, frequency, next_date FROM recurring WHERE active = true AND next_date <= $1',
    [today]
  );

  let created = 0;
  for (const row of r.rows) {
    let next = row.next_date;
    let guard = 0;
    while (next <= today && guard < 120) {
      await db.query(
        `INSERT INTO transactions (user_id, category_id, type, amount, date, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.user_id, row.category_id, row.type, row.amount, next, row.description]
      );
      created += 1;
      next = advanceDate(next, row.frequency);
      guard += 1;
    }
    await db.query('UPDATE recurring SET next_date = $1 WHERE id = $2', [next, row.id]);
  }
  return created;
}
