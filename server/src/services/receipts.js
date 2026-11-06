import db from '../db.js';

// Sprząta paragony, które nigdy nie zostały powiązane z transakcją
// (porzucone importy, transakcje usunięte — FK robi SET NULL) i są starsze
// niż doba. Wołane przez zegar godzinowy z index.js.
export async function cleanupOrphanReceipts() {
  const r = await db.query(
    `DELETE FROM receipts r
     WHERE r.created_at < now() - interval '1 day'
       AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.receipt_id = r.id)`
  );
  return r.rowCount;
}
