import { Router } from 'express';
import db, { withClient } from '../db.js';
import { asyncHandler, httpError } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { toText, toId } from '../validate.js';

const router = Router();
router.use(requireAuth);

// Lista + pozycje zagregowane w JSON (jedno zapytanie, bez N+1)
const SELECT_LISTS = `
  SELECT l.id, l.title, l.status, l.assignee_id, l.created_by, l.created_at, l.updated_at,
         l.household_id, h.name AS household_name,
         cu.name AS created_by_name, a.name AS assignee_name,
         COALESCE((
           SELECT json_agg(json_build_object('id', i.id, 'name', i.name, 'quantity', i.quantity, 'bought', i.bought)
                          ORDER BY i.id)
           FROM shopping_list_items i WHERE i.list_id = l.id
         ), '[]'::json) AS items
  FROM shopping_lists l
  JOIN households h ON h.id = l.household_id
  JOIN users cu ON cu.id = l.created_by
  LEFT JOIN users a ON a.id = l.assignee_id
`;

// Dostęp = członkostwo w domu, do którego należy lista (niezależnie od przełącznika kontekstu)
async function loadList(userId, listId) {
  const r = await db.query(
    `${SELECT_LISTS}
     WHERE l.id = $1
       AND EXISTS (SELECT 1 FROM household_members m
                   WHERE m.household_id = l.household_id AND m.user_id = $2)`,
    [listId, userId]
  );
  if (!r.rows[0]) throw httpError(404, 'Lista zakupów nie istnieje');
  return r.rows[0];
}

// Lista musi być tworzona w budżecie domowym, do którego należę
async function requireMembership(userId, householdIdRaw) {
  if (householdIdRaw == null || householdIdRaw === '') {
    throw httpError(400, 'Wybierz budżet domowy dla listy');
  }
  const householdId = toId(householdIdRaw, 'Identyfikator budżetu domowego');
  const r = await db.query(
    `SELECT h.id FROM household_members m
     JOIN households h ON h.id = m.household_id
     WHERE m.household_id = $1 AND m.user_id = $2`,
    [householdId, userId]
  );
  if (!r.rows[0]) throw httpError(403, 'Nie masz dostępu do tego budżetu domowego');
  return r.rows[0];
}

// Adresat ("wysłana do") musi być członkiem domu; null = lista dla wszystkich
async function validateAssignee(householdId, v) {
  if (v == null || v === '') return null;
  const assigneeId = toId(v, 'Identyfikator adresata');
  const r = await db.query(
    'SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2',
    [householdId, assigneeId]
  );
  if (!r.rows[0]) throw httpError(400, 'Wybrana osoba nie jest członkiem tego budżetu domowego');
  return assigneeId;
}

function validateItemName(v) {
  return toText(v, { label: 'Nazwa produktu', max: 120, required: true });
}

// GET /api/shopping-lists — listy ze WSZYSTKICH moich budżetów domowych (bez przełączania)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const r = await db.query(
      `${SELECT_LISTS}
       WHERE EXISTS (SELECT 1 FROM household_members m
                     WHERE m.household_id = l.household_id AND m.user_id = $1)
       ORDER BY (l.status = 'done'), l.created_at DESC`,
      [req.user.id]
    );
    res.json({ items: r.rows });
  })
);

// POST /api/shopping-lists — nowa lista w wybranym budżecie domowym (+ opcjonalne pozycje)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const hh = await requireMembership(req.user.id, req.body.householdId);
    const title = toText(req.body.title, { label: 'Nazwa listy', max: 100, required: true });
    const assigneeId = await validateAssignee(hh.id, req.body.assigneeId);

    const raw = Array.isArray(req.body.items) ? req.body.items.slice(0, 100) : [];
    const items = raw.map((it) => ({
      name: validateItemName(it?.name),
      quantity: toText(it?.quantity, { label: 'Ilość', max: 40 }),
    }));

    const id = await withClient(async (client) => {
      const r = await client.query(
        `INSERT INTO shopping_lists (household_id, created_by, assignee_id, title)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [hh.id, req.user.id, assigneeId, title]
      );
      const listId = r.rows[0].id;
      for (const it of items) {
        await client.query(
          'INSERT INTO shopping_list_items (list_id, name, quantity) VALUES ($1, $2, $3)',
          [listId, it.name, it.quantity]
        );
      }
      return listId;
    });
    res.status(201).json({ id });
  })
);

// PATCH /api/shopping-lists/:id — zmiana nazwy / adresata / statusu
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const list = await loadList(req.user.id, id);

    const sets = [];
    const params = [];
    if (req.body.title !== undefined) {
      params.push(toText(req.body.title, { label: 'Nazwa listy', max: 100, required: true }));
      sets.push(`title = $${params.length}`);
    }
    if (req.body.assigneeId !== undefined) {
      params.push(await validateAssignee(list.household_id, req.body.assigneeId));
      sets.push(`assignee_id = $${params.length}`);
    }
    if (req.body.status !== undefined) {
      const status = req.body.status;
      if (status !== 'active' && status !== 'done') {
        throw httpError(400, 'Status musi być active lub done');
      }
      params.push(status);
      sets.push(`status = $${params.length}`);
    }
    if (sets.length === 0) throw httpError(400, 'Nic do zmiany');

    sets.push('updated_at = now()');
    params.push(id, list.household_id);
    await db.query(
      `UPDATE shopping_lists SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND household_id = $${params.length}`,
      params
    );
    res.json({ ok: true });
  })
);

// DELETE /api/shopping-lists/:id — usunięcie listy z pozycjami
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const list = await loadList(req.user.id, id);
    await db.query('DELETE FROM shopping_lists WHERE id = $1 AND household_id = $2', [
      id,
      list.household_id,
    ]);
    res.json({ ok: true });
  })
);

// POST /api/shopping-lists/:id/items — dodanie pozycji
router.post(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    await loadList(req.user.id, id);
    const name = validateItemName(req.body.name);
    const quantity = toText(req.body.quantity, { label: 'Ilość', max: 40 });
    const r = await db.query(
      'INSERT INTO shopping_list_items (list_id, name, quantity) VALUES ($1, $2, $3) RETURNING id',
      [id, name, quantity]
    );
    res.status(201).json({ id: r.rows[0].id });
  })
);

// PATCH /api/shopping-lists/:id/items/:itemId — odhaczenie / edycja pozycji
router.patch(
  '/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const itemId = toId(req.params.itemId, 'Identyfikator pozycji');
    await loadList(req.user.id, id);

    const sets = [];
    const params = [];
    if (req.body.bought !== undefined) {
      if (typeof req.body.bought !== 'boolean') throw httpError(400, 'Kupione musi być true/false');
      params.push(req.body.bought);
      sets.push(`bought = $${params.length}`);
    }
    if (req.body.name !== undefined) {
      params.push(validateItemName(req.body.name));
      sets.push(`name = $${params.length}`);
    }
    if (req.body.quantity !== undefined) {
      params.push(toText(req.body.quantity, { label: 'Ilość', max: 40 }));
      sets.push(`quantity = $${params.length}`);
    }
    if (sets.length === 0) throw httpError(400, 'Nic do zmiany');

    params.push(itemId, id);
    const r = await db.query(
      `UPDATE shopping_list_items SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND list_id = $${params.length}`,
      params
    );
    if (r.rowCount === 0) throw httpError(404, 'Pozycja nie istnieje');
    res.json({ ok: true });
  })
);

// DELETE /api/shopping-lists/:id/items/:itemId — usunięcie pozycji
router.delete(
  '/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const itemId = toId(req.params.itemId, 'Identyfikator pozycji');
    await loadList(req.user.id, id);
    const r = await db.query(
      'DELETE FROM shopping_list_items WHERE id = $1 AND list_id = $2',
      [itemId, id]
    );
    if (r.rowCount === 0) throw httpError(404, 'Pozycja nie istnieje');
    res.json({ ok: true });
  })
);

export default router;
