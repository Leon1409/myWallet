import pg from 'pg';

// DATE (OID 1082) zwracaj jako string 'YYYY-MM-DD' zamiast obiektu Date
pg.types.setTypeParser(1082, (v) => v);

// Rozmiar puli konfigurowalny env-em — przy współdzielonej bazie (home.pl)
// limit połączeń bywa mały, dlatego osobno dla produkcji można zmniejszyć.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.PG_POOL_MAX ? parseInt(process.env.PG_POOL_MAX, 10) : 10,
});

const db = {
  query: (text, params) => pool.query(text, params),
};

// Wykonuje fn(client) w transakcji; ROLLBACK przy błędzie
export async function withClient(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default db;
