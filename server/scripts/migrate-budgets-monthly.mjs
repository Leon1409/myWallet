// Jedno-offowa migracja budżetów: z limity-per-kategoria na JEDEN limit miesięczny.
// Stare limity kategorii z jednego miesiąca sumują się w jeden limit tego miesiąca.
// Uruchamiany ręcznie przez właściciela (z katalogu server/):
//   node scripts/migrate-budgets-monthly.mjs
// Potem restart serwera — schema.js dopasuje indeks (idx_budgets_user_month).
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  // Kształt zgodny z server/src/schema.js (budgets bez category_id)
  const oldShape = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'budgets' AND column_name = 'category_id'`
  );
  if (!oldShape.rows[0]) {
    console.log('✔  Tabela budgets ma już nowy kształt (bez category_id) — nic do roboty');
  } else {
    await pool.query('BEGIN');
    await pool.query(`
      CREATE TABLE budgets_monthly (
        id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        month      DATE NOT NULL,
        amount     NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, month)
      )
    `);
    const moved = await pool.query(`
      INSERT INTO budgets_monthly (user_id, month, amount, created_at)
      SELECT user_id, month, SUM(amount), MIN(created_at)
      FROM budgets
      GROUP BY user_id, month
    `);
    await pool.query('DROP TABLE budgets');
    await pool.query('ALTER TABLE budgets_monthly RENAME TO budgets');
    await pool.query('COMMIT');
    console.log(`✔  Zmigrowano ${moved.rowCount} miesięczny/ch limit(y) — stare limity kategorii zsumowane`);
  }
} catch (err) {
  await pool.query('ROLLBACK').catch(() => {});
  console.error('❌ Migracja wycofana:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
