import { Router } from 'express';
import db from '../db.js';
import { asyncHandler, httpError } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { toAmount, toIsoDate, toText, toId, round2 } from '../validate.js';

const router = Router();
router.use(requireAuth);

// Wspólny SELECT z nazwami kategorii
const SELECT = `
  SELECT t.id, t.type, t.amount, t.date, t.description,
         c.id AS category_id, c.name AS category_name, c.color AS category_color,
         c.icon AS category_icon
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;

async function getTransaction(userId, id) {
  const r = await db.query(`${SELECT} WHERE t.id = $1 AND t.user_id = $2`, [id, userId]);
  if (!r.rows[0]) throw httpError(404, 'Transakcja nie istnieje');
  return r.rows[0];
}

// Buduje WHERE na podstawie filtrów — zwraca [conditions, params]
function buildFilters(userId, query) {
  const conditions = ['t.user_id = $1'];
  const params = [userId];
  const add = (clause, value) => {
    params.push(value);
    conditions.push(clause.replace('$?', `$${params.length}`));
  };

  if (query.from) add('t.date >= $?', query.from);
  if (query.to) add('t.date <= $?', query.to);
  if (query.categoryId) add('t.category_id = $?', toId(query.categoryId));
  if (query.type === 'income' || query.type === 'expense') add('t.type = $?', query.type);
  if (query.search) {
    const s = `%${String(query.search).trim().slice(0, 80)}%`;
    conditions.push(`(t.description ILIKE '%' || $${params.length + 1} || '%' OR c.name ILIKE '%' || $${params.length + 1} || '%')`);
    params.push(s);
  }
  return [conditions.join(' AND '), params];
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [where, params] = buildFilters(req.owner.id, req.query);

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const totals = await db.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount END), 0) AS income,
              COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount END), 0) AS expense
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${where}`,
      params
    );

    const items = await db.query(
      `${SELECT} WHERE ${where} ORDER BY t.date DESC, t.id DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const t = totals.rows[0];
    res.json({
      items: items.rows.map((row) => ({ ...row, amount: round2(row.amount) })),
      total: t.total,
      totals: { income: round2(t.income), expense: round2(t.expense) },
      page,
      limit,
    });
  })
);

// Walidacja kategorii użytkownika (typ musi pasować do transakcji)
async function validateCategory(userId, categoryId, type) {
  if (categoryId == null) return null;
  const cat = await db.query('SELECT type FROM categories WHERE id = $1 AND user_id = $2', [
    categoryId,
    userId,
  ]);
  if (!cat.rows[0]) throw httpError(400, 'Wybrana kategoria nie istnieje');
  if (cat.rows[0].type !== type) {
    throw httpError(400, 'Kategoria nie pasuje do typu transakcji');
  }
  return categoryId;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const type = req.body.type;
    if (type !== 'income' && type !== 'expense') {
      throw httpError(400, 'Typ transakcji musi być income lub expense');
    }
    const amount = toAmount(req.body.amount);
    const date = toIsoDate(req.body.date);
    const description = toText(req.body.description, { max: 200 });
    const categoryId =
      req.body.categoryId != null && req.body.categoryId !== ''
        ? await validateCategory(req.owner.id, toId(req.body.categoryId, 'Identyfikator kategorii'), type)
        : null;

    const r = await db.query(
      `INSERT INTO transactions (user_id, category_id, type, amount, date, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.owner.id, categoryId, type, amount, date, description]
    );
    res.status(201).json(await getTransaction(req.owner.id, r.rows[0].id));
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    await getTransaction(req.owner.id, id);

    const type = req.body.type;
    if (type !== 'income' && type !== 'expense') {
      throw httpError(400, 'Typ transakcji musi być income lub expense');
    }
    const amount = toAmount(req.body.amount);
    const date = toIsoDate(req.body.date);
    const description = toText(req.body.description, { max: 200 });
    const categoryId =
      req.body.categoryId != null && req.body.categoryId !== ''
        ? await validateCategory(req.owner.id, toId(req.body.categoryId, 'Identyfikator kategorii'), type)
        : null;

    await db.query(
      `UPDATE transactions
       SET category_id = $1, type = $2, amount = $3, date = $4, description = $5
       WHERE id = $6 AND user_id = $7`,
      [categoryId, type, amount, date, description, id, req.owner.id]
    );
    res.json(await getTransaction(req.owner.id, id));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const r = await db.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [
      id,
      req.owner.id,
    ]);
    if (r.rowCount === 0) throw httpError(404, 'Transakcja nie istnieje');
    res.json({ deleted: 1 });
  })
);

// Eksport CSV (średnik + przecinek dziesiętny = przyjazne polskiemu Excelowi)
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const [where, params] = buildFilters(req.owner.id, req.query);
    const r = await db.query(
      `${SELECT} WHERE ${where} ORDER BY t.date DESC, t.id DESC LIMIT 10000`,
      params
    );

    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const header = ['Data', 'Typ', 'Kwota', 'Kategoria', 'Opis'];
    const rows = r.rows.map((t) => [
      t.date,
      t.type === 'income' ? 'Przychód' : 'Wydatek',
      round2(t.amount).toFixed(2).replace('.', ','),
      t.category_name || '—',
      t.description || '',
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(esc).join(';')).join('\r\n')}`;

    const stamp = (req.query.from && String(req.query.from).slice(0, 7)) || 'wszystkie';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transakcje_${stamp}.csv"`);
    res.send(csv);
  })
);

export default router;
