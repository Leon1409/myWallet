import { Router } from 'express';
import db from '../db.js';
import { asyncHandler, httpError } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { toAmount, toIsoDate, toText, toId, round2 } from '../validate.js';

const router = Router();
router.use(requireAuth);

const SELECT = `
  SELECT r.id, r.type, r.amount, r.description, r.frequency, r.next_date, r.active,
         c.id AS category_id, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
  FROM recurring r
  LEFT JOIN categories c ON c.id = r.category_id
`;

async function validateRecurring(userId, body) {
  const type = body.type;
  if (type !== 'income' && type !== 'expense') {
    throw httpError(400, 'Typ musi być income lub expense');
  }
  const frequency = body.frequency;
  if (frequency !== 'weekly' && frequency !== 'monthly') {
    throw httpError(400, 'Częstotliwość musi być weekly lub monthly');
  }
  const amount = toAmount(body.amount);
  const description = toText(body.description, { label: 'Opis', max: 200, required: true });
  const nextDate = toIsoDate(body.nextDate, 'Data następnego obciążenia');
  const categoryId =
    body.categoryId != null && body.categoryId !== ''
      ? toId(body.categoryId, 'Identyfikator kategorii')
      : null;

  if (categoryId != null) {
    const cat = await db.query('SELECT type FROM categories WHERE id = $1 AND user_id = $2', [
      categoryId,
      userId,
    ]);
    if (!cat.rows[0]) throw httpError(400, 'Wybrana kategoria nie istnieje');
    if (cat.rows[0].type !== type) throw httpError(400, 'Kategoria nie pasuje do typu wpisu');
  }

  return { type, frequency, amount, description, nextDate, categoryId };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const r = await db.query(
      `${SELECT} WHERE r.user_id = $1 ORDER BY r.active DESC, r.next_date ASC`,
      [req.owner.id]
    );
    res.json({
      items: r.rows.map((row) => ({ ...row, amount: round2(row.amount) })),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = await validateRecurring(req.owner.id, req.body);
    const r = await db.query(
      `INSERT INTO recurring (user_id, category_id, type, amount, description, frequency, next_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        req.owner.id,
        data.categoryId,
        data.type,
        data.amount,
        data.description,
        data.frequency,
        data.nextDate,
      ]
    );
    res.status(201).json({ id: r.rows[0].id });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const existing = await db.query(
      'SELECT id FROM recurring WHERE id = $1 AND user_id = $2',
      [id, req.owner.id]
    );
    if (!existing.rows[0]) throw httpError(404, 'Wpis cykliczny nie istnieje');

    // Sam przełącznik aktywności
    if (req.body.active != null && Object.keys(req.body).length === 1) {
      await db.query('UPDATE recurring SET active = $1 WHERE id = $2 AND user_id = $3', [
        Boolean(req.body.active),
        id,
        req.owner.id,
      ]);
      return res.json({ ok: true });
    }

    const data = await validateRecurring(req.owner.id, req.body);
    await db.query(
      `UPDATE recurring SET category_id = $1, type = $2, amount = $3,
        description = $4, frequency = $5, next_date = $6 WHERE id = $7 AND user_id = $8`,
      [
        data.categoryId,
        data.type,
        data.amount,
        data.description,
        data.frequency,
        data.nextDate,
        id,
        req.owner.id,
      ]
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const r = await db.query('DELETE FROM recurring WHERE id = $1 AND user_id = $2', [id, req.owner.id]);
    if (r.rowCount === 0) throw httpError(404, 'Wpis cykliczny nie istnieje');
    res.json({ ok: true });
  })
);

export default router;
