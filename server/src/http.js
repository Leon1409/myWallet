export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, next) {
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Rekord już istnieje (duplikat)' });
  }
  if (err.code === '23503') {
    return res.status(409).json({ error: 'Nie można usunąć — istnieją powiązane rekordy' });
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Błąd serwera. Spróbuj ponownie.' });
}
