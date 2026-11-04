import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { asyncHandler, httpError } from '../http.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { seedCategories } from '../defaults.js';

const router = Router();

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    const name = (req.body.name || '').trim();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw httpError(400, 'Podaj prawidłowy adres e-mail');
    }
    if (email.endsWith('@mywallet.local')) {
      throw httpError(400, 'Ten adres e-mail jest niedostępny');
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw httpError(400, 'Hasło musi mieć co najmniej 8 znaków');
    }
    if (!name || name.length > 80) {
      throw httpError(400, 'Podaj imię (maks. 80 znaków)');
    }

    const hash = await bcrypt.hash(password, 10);
    let user;
    try {
      const r = await db.query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
        [email, name, hash]
      );
      user = r.rows[0];
    } catch (err) {
      if (err.code === '23505') throw httpError(409, 'Konto z tym adresem e-mail już istnieje');
      throw err;
    }

    await seedCategories(user.id);
    res.status(201).json({ token: signToken(user.id), user });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) throw httpError(400, 'Podaj e-mail i hasło');

    const r = await db.query(
      "SELECT id, email, name, password_hash FROM users WHERE email = $1 AND email NOT LIKE '%@mywallet.local'",
      [email]
    );
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw httpError(401, 'Nieprawidłowy e-mail lub hasło');
    }
    res.json({
      token: signToken(user.id),
      user: { id: user.id, email: user.email, name: user.name },
    });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await db.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [
      req.user.id,
    ]);
    if (!r.rows[0]) throw httpError(401, 'Użytkownik nie istnieje');
    res.json({ user: r.rows[0] });
  })
);

export default router;
