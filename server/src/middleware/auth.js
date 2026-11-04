import jwt from 'jsonwebtoken';
import db from '../db.js';
import { asyncHandler } from '../http.js';

const SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET(), { expiresIn: '7d' });
}

// Rozwiązuje "właściciela budżetu": nagłówek X-Household-Id wskazuje budżet domowy,
// w którym użytkownik jest członkiem — wtedy dane należą do "użytkownika budżetowego" domu.
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Brak autoryzacji — zaloguj się' });

  let payload;
  try {
    payload = jwt.verify(token, SECRET());
  } catch {
    return res.status(401).json({ error: 'Sesja wygasła — zaloguj się ponownie' });
  }
  req.user = { id: payload.sub };

  const hhId = parseInt(req.headers['x-household-id'], 10);
  if (!hhId) {
    req.owner = { id: req.user.id, household: null };
    return next();
  }
  if (!Number.isInteger(hhId) || hhId <= 0) {
    return res.status(400).json({ error: 'Nieprawidłowy identyfikator budżetu domowego' });
  }

  const r = await db.query(
    `SELECT h.id, h.name, h.user_id, m.role
     FROM household_members m
     JOIN households h ON h.id = m.household_id
     WHERE m.household_id = $1 AND m.user_id = $2`,
    [hhId, req.user.id]
  );
  const hh = r.rows[0];
  if (!hh) {
    return res.status(403).json({ error: 'Nie masz dostępu do tego budżetu domowego' });
  }
  req.owner = {
    id: hh.user_id,
    household: { id: hh.id, name: hh.name, role: hh.role },
  };
  next();
});
