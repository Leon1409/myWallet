import { Router } from 'express';
import multer from 'multer';
import db from '../db.js';
import { asyncHandler, httpError } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { toId } from '../validate.js';
import { parseReceipt } from '../services/ai.js';

const router = Router();
router.use(requireAuth);

// Zdjęcie do 5 MB w pamięci (base64 do AI + zapis BYTEA)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(httpError(400, 'Dozwolone są tylko zdjęcia JPG/PNG/WebP'));
  },
});

// POST /api/receipts — upload zdjęcia paragonu + odczyt przez AI.
// Obraz zapisujemy od razu (receiptId); transakcję zbiorczą użytkownik
// zatwierdza osobno w POST /api/transactions (z receiptId).
// Parsowanie się nie udało -> wpis usuwamy, żeby nie zostawiać śmieci.
router.post(
  '/',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw httpError(400, 'Brak zdjęcia — załącz plik w polu "image"');

    const cats = await db.query(
      "SELECT id, name FROM categories WHERE user_id = $1 AND type = 'expense' ORDER BY name ASC",
      [req.owner.id]
    );
    const ins = await db.query(
      'INSERT INTO receipts (user_id, image, mime) VALUES ($1, $2, $3) RETURNING id',
      [req.owner.id, req.file.buffer, req.file.mimetype]
    );

    try {
      const parsed = await parseReceipt({
        buffer: req.file.buffer,
        mime: req.file.mimetype,
        categories: cats.rows,
      });
      res.status(201).json({ receiptId: ins.rows[0].id, ...parsed });
    } catch (err) {
      await db.query('DELETE FROM receipts WHERE id = $1 AND user_id = $2', [
        ins.rows[0].id,
        req.owner.id,
      ]);
      throw err;
    }
  })
);

// GET /api/receipts/:id/image — zdjęcie paragonu (widoczne dla członków budżetu)
router.get(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id, 'Identyfikator paragonu');
    const r = await db.query('SELECT image, mime FROM receipts WHERE id = $1 AND user_id = $2', [
      id,
      req.owner.id,
    ]);
    if (!r.rows[0]) throw httpError(404, 'Paragon nie istnieje');
    res.setHeader('Content-Type', r.rows[0].mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(r.rows[0].image);
  })
);

export default router;
