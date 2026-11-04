import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import db, { withClient } from '../db.js';
import { asyncHandler, httpError } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { seedCategories } from '../defaults.js';
import { toText, toId } from '../validate.js';

const router = Router();
router.use(requireAuth);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function currentUser(req) {
  const r = await db.query('SELECT id, email, name FROM users WHERE id = $1', [req.user.id]);
  return r.rows[0];
}

// Sprawdza członkostwo (opcjonalnie rolę właściciela); zwraca dane budżetu domowego
async function requireMembership(req, householdId, requireOwner = false) {
  const r = await db.query(
    `SELECT h.id, h.name, h.owner_id, h.user_id, m.role
     FROM household_members m
     JOIN households h ON h.id = m.household_id
     WHERE m.household_id = $1 AND m.user_id = $2`,
    [householdId, req.user.id]
  );
  const hh = r.rows[0];
  if (!hh) throw httpError(404, 'Budżet domowy nie istnieje');
  if (requireOwner && hh.role !== 'owner') {
    throw httpError(403, 'Tylko właściciel budżetu domowego może to zrobić');
  }
  return hh;
}

// GET /api/households — moje budżety domowe + zaproszenia oczekujące na mnie
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = await currentUser(req);
    const [items, invites] = await Promise.all([
      db.query(
        `SELECT h.id, h.name, m.role, h.created_at,
                (SELECT COUNT(*)::int FROM household_members mm WHERE mm.household_id = h.id) AS member_count
         FROM household_members m
         JOIN households h ON h.id = m.household_id
         WHERE m.user_id = $1
         ORDER BY h.created_at ASC`,
        [req.user.id]
      ),
      db.query(
        `SELECT i.id, i.created_at, h.id AS household_id, h.name AS household_name, u.name AS invited_by_name
         FROM household_invites i
         JOIN households h ON h.id = i.household_id
         JOIN users u ON u.id = i.invited_by
         WHERE i.status = 'pending' AND i.email = $1
         ORDER BY i.created_at DESC`,
        [me.email]
      ),
    ]);
    res.json({ items: items.rows, invites: invites.rows });
  })
);

// POST /api/households — tworzy budżet domowy (+ ukrytego użytkownika budżetowego)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = toText(req.body.name, { label: 'Nazwa budżetu domowego', max: 60, required: true });
    const me = await currentUser(req);

    const budgetUserId = await withClient(async (client) => {
      const syntheticEmail = `dom-${crypto.randomUUID()}@mywallet.local`;
      const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
      const u = await client.query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [syntheticEmail, name, passwordHash]
      );
      const h = await client.query(
        'INSERT INTO households (name, owner_id, user_id) VALUES ($1, $2, $3) RETURNING id',
        [name, me.id, u.rows[0].id]
      );
      await client.query(
        "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')",
        [h.rows[0].id, me.id]
      );
      return u.rows[0].id;
    });

    await seedCategories(budgetUserId);
    res.status(201).json({ ok: true });
  })
);

// POST /api/households/invites/:inviteId/accept — dołączenie do budżetu domowego
router.post(
  '/invites/:inviteId/accept',
  asyncHandler(async (req, res) => {
    const inviteId = toId(req.params.inviteId);
    const me = await currentUser(req);
    const inv = await db.query(
      `SELECT i.id, i.household_id, h.name
       FROM household_invites i
       JOIN households h ON h.id = i.household_id
       WHERE i.id = $1 AND i.email = $2 AND i.status = 'pending'`,
      [inviteId, me.email]
    );
    const row = inv.rows[0];
    if (!row) throw httpError(404, 'Zaproszenie nie istnieje lub już zostało użyte');

    try {
      await withClient(async (client) => {
        await client.query(
          'INSERT INTO household_members (household_id, user_id) VALUES ($1, $2)',
          [row.household_id, me.id]
        );
        await client.query("UPDATE household_invites SET status = 'accepted' WHERE id = $1", [
          inviteId,
        ]);
      });
    } catch (err) {
      if (err.code === '23505') throw httpError(409, 'Już należysz do tego budżetu domowego');
      throw err;
    }
    res.json({ household: { id: row.household_id, name: row.name } });
  })
);

// POST /api/households/invites/:inviteId/decline — odrzucenie zaproszenia
router.post(
  '/invites/:inviteId/decline',
  asyncHandler(async (req, res) => {
    const inviteId = toId(req.params.inviteId);
    const me = await currentUser(req);
    const r = await db.query(
      "UPDATE household_invites SET status = 'declined' WHERE id = $1 AND email = $2 AND status = 'pending'",
      [inviteId, me.email]
    );
    if (r.rowCount === 0) throw httpError(404, 'Zaproszenie nie istnieje lub już zostało użyte');
    res.json({ ok: true });
  })
);

// GET /api/households/:id — szczegóły (członkowie; zaproszenia tylko dla właściciela)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id, 'Identyfikator budżetu domowego');
    const hh = await requireMembership(req, id);
    const members = await db.query(
      `SELECT u.id, u.name, u.email, m.role, m.joined_at
       FROM household_members m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = $1
       ORDER BY m.joined_at ASC`,
      [id]
    );
    let invites = [];
    if (hh.role === 'owner') {
      const inv = await db.query(
        `SELECT id, email, created_at FROM household_invites
         WHERE household_id = $1 AND status = 'pending'
         ORDER BY created_at DESC`,
        [id]
      );
      invites = inv.rows;
    }
    res.json({ id: hh.id, name: hh.name, role: hh.role, members: members.rows, invites });
  })
);

// PATCH /api/households/:id — zmiana nazwy (właściciel)
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id, 'Identyfikator budżetu domowego');
    const name = toText(req.body.name, { label: 'Nazwa budżetu domowego', max: 60, required: true });
    const hh = await requireMembership(req, id, true);
    await db.query('UPDATE households SET name = $1 WHERE id = $2', [name, hh.id]);
    res.json({ ok: true });
  })
);

// DELETE /api/households/:id — usunięcie budżetu domowego wraz z danymi (właściciel)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id, 'Identyfikator budżetu domowego');
    const hh = await requireMembership(req, id, true);
    await withClient(async (client) => {
      await client.query('DELETE FROM households WHERE id = $1', [hh.id]);
      await client.query('DELETE FROM users WHERE id = $1', [hh.user_id]);
    });
    res.json({ ok: true });
  })
);

// POST /api/households/:id/invites — zaproszenie po adresie e-mail (właściciel)
router.post(
  '/:id/invites',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id, 'Identyfikator budżetu domowego');
    await requireMembership(req, id, true);
    const me = await currentUser(req);
    const email = (req.body.email || '').trim().toLowerCase();

    if (!EMAIL_RE.test(email)) throw httpError(400, 'Podaj prawidłowy adres e-mail');
    if (email.endsWith('@mywallet.local')) throw httpError(400, 'Nieprawidłowy adres e-mail');
    if (email === me.email) throw httpError(400, 'Nie możesz zaprosić siebie');

    const member = await db.query(
      `SELECT 1 FROM household_members m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = $1 AND u.email = $2`,
      [id, email]
    );
    if (member.rows[0]) throw httpError(409, 'Ta osoba już należy do budżetu domowego');

    const dup = await db.query(
      "SELECT 1 FROM household_invites WHERE household_id = $1 AND email = $2 AND status = 'pending'",
      [id, email]
    );
    if (dup.rows[0]) throw httpError(409, 'Zaproszenie dla tego adresu już oczekuje na odpowiedź');

    await db.query(
      'INSERT INTO household_invites (household_id, email, invited_by) VALUES ($1, $2, $3)',
      [id, email, me.id]
    );
    res.status(201).json({ ok: true });
  })
);

// DELETE /api/households/:id/invites/:inviteId — cofnięcie zaproszenia (właściciel)
router.delete(
  '/:id/invites/:inviteId',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id, 'Identyfikator budżetu domowego');
    await requireMembership(req, id, true);
    const inviteId = toId(req.params.inviteId);
    const r = await db.query(
      "UPDATE household_invites SET status = 'revoked' WHERE id = $1 AND household_id = $2 AND status = 'pending'",
      [inviteId, id]
    );
    if (r.rowCount === 0) throw httpError(404, 'Zaproszenie nie istnieje');
    res.json({ ok: true });
  })
);

// POST /api/households/:id/leave — opuszczenie budżetu (członek)
router.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id, 'Identyfikator budżetu domowego');
    const hh = await requireMembership(req, id);
    if (hh.role === 'owner') {
      throw httpError(400, 'Właściciel nie może opuścić budżetu — usuń budżet domowy');
    }
    await withClient(async (client) => {
      await client.query('DELETE FROM household_members WHERE household_id = $1 AND user_id = $2', [
        id,
        req.user.id,
      ]);
      // Wysłane mu listy zakupów zostają — tracą tylko adresata
      await client.query(
        'UPDATE shopping_lists SET assignee_id = NULL, updated_at = now() WHERE household_id = $1 AND assignee_id = $2',
        [id, req.user.id]
      );
    });
    res.json({ ok: true });
  })
);

// DELETE /api/households/:id/members/:userId — usunięcie członka (właściciel)
router.delete(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id, 'Identyfikator budżetu domowego');
    await requireMembership(req, id, true);
    const userId = toId(req.params.userId);
    if (String(userId) === String(req.user.id)) {
      throw httpError(400, 'Nie możesz usunąć siebie');
    }
    const removed = await withClient(async (client) => {
      const r = await client.query(
        'DELETE FROM household_members WHERE household_id = $1 AND user_id = $2',
        [id, userId]
      );
      // Wysłane jemu listy zakupów zostają — tracą tylko adresata
      await client.query(
        'UPDATE shopping_lists SET assignee_id = NULL, updated_at = now() WHERE household_id = $1 AND assignee_id = $2',
        [id, userId]
      );
      return r.rowCount;
    });
    if (removed === 0) throw httpError(404, 'Ten użytkownik nie należy do budżetu domowego');
    res.json({ ok: true });
  })
);

export default router;
