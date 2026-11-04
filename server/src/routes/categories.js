import { Router } from 'express';
import db from '../db.js';
import { asyncHandler, httpError } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { toText, toId } from '../validate.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const r = await db.query(
      'SELECT id, name, type, color, icon FROM categories WHERE user_id = $1 ORDER BY type ASC, name ASC',
      [req.owner.id]
    );
    res.json({ items: r.rows });
  })
);

function validateCategory(body, { requireType = true } = {}) {
  const name = toText(body.name, { label: 'Nazwa kategorii', max: 60, required: true });
  const type = body.type;
  if (requireType && type !== 'income' && type !== 'expense') {
    throw httpError(400, 'Typ kategorii musi być income lub expense');
  }
  const color = toText(body.color, { max: 20 }) || '#635bff';
  const icon = toText(body.icon, { max: 10 }) || '📦';
  return { name, type, color, icon };
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, type, color, icon } = validateCategory(req.body);
    const dup = await db.query(
      'SELECT 1 FROM categories WHERE user_id = $1 AND name = $2 AND type = $3',
      [req.owner.id, name, type]
    );
    if (dup.rows[0]) throw httpError(409, 'Kategoria o tej nazwie już istnieje');

    const r = await db.query(
      'INSERT INTO categories (user_id, name, type, color, icon) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.owner.id, name, type, color, icon]
    );
    res.status(201).json({ id: r.rows[0].id });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const existing = await db.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.owner.id]
    );
    if (!existing.rows[0]) throw httpError(404, 'Kategoria nie istnieje');

    const { name, color, icon } = validateCategory(req.body, { requireType: false });
    await db.query(
      'UPDATE categories SET name = $1, color = $2, icon = $3 WHERE id = $4 AND user_id = $5',
      [name, color, icon, id, req.owner.id]
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const used = await db.query(
      `SELECT (SELECT COUNT(*)::int FROM transactions WHERE category_id = $1 AND user_id = $2) AS tx`,
      [id, req.owner.id]
    );
    const { tx } = used.rows[0];
    if (tx > 0) {
      throw httpError(
        409,
        `Kategoria jest w użyciu (${tx} transakcji) — najpierw usuń lub przypisz je inaczej`
      );
    }
    await db.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, req.owner.id]);
    res.json({ ok: true });
  })
);

export default router;
