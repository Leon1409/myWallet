import { Router } from 'express';
import db from '../db.js';
import { asyncHandler, httpError } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { toAmount, toMonth, toId, round2 } from '../validate.js';

const router = Router();
router.use(requireAuth);

// Wydane w miesiącu — tak samo liczy Dashboard (stats.js), w tym przelewy jako wydatek
const MONTH_RANGE = (col) => `${col} >= $2 AND ${col} < $2::date + INTERVAL '1 month'`;

// GET /api/budgets?month=RRRR-MM — limit miesiąca, wydane łącznie + rozbicie na kategorie
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const month = toMonth(req.query.month, 'Miesiąc');

    const [budget, spent, byCat, uncat] = await Promise.all([
      db.query('SELECT id, month, amount FROM budgets WHERE user_id = $1 AND month = $2', [
        req.owner.id,
        month,
      ]),
      db.query(
        `SELECT COALESCE(SUM(amount), 0) AS spent
         FROM transactions
         WHERE user_id = $1 AND type = 'expense' AND ${MONTH_RANGE('date')}`,
        [req.owner.id, month]
      ),
      db.query(
        `SELECT c.id, c.name, c.color, c.icon, SUM(t.amount) AS spent
         FROM transactions t JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = $1 AND t.type = 'expense' AND ${MONTH_RANGE('t.date')}
         GROUP BY c.id
         ORDER BY spent DESC`,
        [req.owner.id, month]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0) AS spent
         FROM transactions
         WHERE user_id = $1 AND type = 'expense' AND category_id IS NULL
           AND ${MONTH_RANGE('date')}`,
        [req.owner.id, month]
      ),
    ]);

    res.json({
      budget: budget.rows[0]
        ? {
            id: budget.rows[0].id,
            month: budget.rows[0].month,
            amount: round2(budget.rows[0].amount),
          }
        : null,
      spent: round2(spent.rows[0].spent),
      uncategorized: round2(uncat.rows[0].spent),
      categories: byCat.rows.map((c) => ({ ...c, spent: round2(c.spent) })),
    });
  })
);

// POST /api/budgets — ustawia/nadpisuje limit wydatków na miesiąc (upsert)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const month = toMonth(req.body.month, 'Miesiąc');
    const amount = toAmount(req.body.amount, 'Limit wydatków');
    const r = await db.query(
      `INSERT INTO budgets (user_id, month, amount) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, month) DO UPDATE SET amount = EXCLUDED.amount
       RETURNING id`,
      [req.owner.id, month, amount]
    );
    res.status(201).json({ id: r.rows[0].id });
  })
);

// DELETE /api/budgets/:id — usuwa limit miesiąca
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const r = await db.query('DELETE FROM budgets WHERE id = $1 AND user_id = $2', [
      id,
      req.owner.id,
    ]);
    if (r.rowCount === 0) throw httpError(404, 'Budżet nie istnieje');
    res.json({ ok: true });
  })
);

export default router;
