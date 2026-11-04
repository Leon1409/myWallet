import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { toMonth, round2 } from '../validate.js';

const router = Router();
router.use(requireAuth);

// GET /api/stats/summary?month=RRRR-MM
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const monthStart = toMonth(req.query.month, 'Miesiąc');

    const [kpi, byCategory, daily, budgets, recent] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense
         FROM transactions
         WHERE user_id = $1 AND date >= $2 AND date < $2::date + INTERVAL '1 month'`,
        [req.owner.id, monthStart]
      ),
      db.query(
        `SELECT c.id, c.name, c.color, c.icon, SUM(t.amount) AS amount
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = $1 AND t.type = 'expense'
           AND t.date >= $2 AND t.date < $2::date + INTERVAL '1 month'
         GROUP BY c.id
         ORDER BY amount DESC`,
        [req.owner.id, monthStart]
      ),
      db.query(
        `SELECT d::date AS date,
                COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount END), 0) AS expense,
                COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount END), 0) AS income
         FROM generate_series(
                $2::date,
                ($2::date + INTERVAL '1 month' - INTERVAL '1 day')::date,
                INTERVAL '1 day'
              ) d
         LEFT JOIN transactions t
           ON t.user_id = $1 AND t.date = d::date
         GROUP BY d
         ORDER BY d`,
        [req.owner.id, monthStart]
      ),
      db.query(
        `SELECT b.id, b.amount,
                COALESCE((
                  SELECT SUM(t.amount) FROM transactions t
                  WHERE t.user_id = b.user_id AND t.type = 'expense'
                    AND t.date >= b.month AND t.date < b.month + INTERVAL '1 month'
                ), 0) AS spent
         FROM budgets b
         WHERE b.user_id = $1 AND b.month = $2`,
        [req.owner.id, monthStart]
      ),
      db.query(
        `SELECT t.id, t.type, t.amount, t.date, t.description,
                c.id AS category_id, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = $1
         ORDER BY t.date DESC, t.id DESC
         LIMIT 6`,
        [req.owner.id]
      ),
    ]);

    const income = round2(kpi.rows[0].income);
    const expense = round2(kpi.rows[0].expense);

    res.json({
      month: monthStart.slice(0, 7),
      income,
      expense,
      net: round2(income - expense),
      byCategory: byCategory.rows.map((c) => ({ ...c, amount: round2(c.amount) })),
      daily: daily.rows.map((d) => ({
        date: d.date,
        expense: round2(d.expense),
        income: round2(d.income),
      })),
      budget: budgets.rows[0]
        ? { id: budgets.rows[0].id, amount: round2(budgets.rows[0].amount), spent: round2(budgets.rows[0].spent) }
        : null,
      recent: recent.rows.map((t) => ({ ...t, amount: round2(t.amount) })),
    });
  })
);

export default router;
