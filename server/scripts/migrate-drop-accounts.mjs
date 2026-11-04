// Jedno-offowa migracja: USUWAMY KONTA z modelu (bez kontekstu karty/konta).
// Tabele accounts, transactions i recurring zmieniają kształt — bo są PUSTE
// (dane testowe: 0 wierszy), najprościej je dropnąć; ensureSchema() przy
// starcie serwera odtworzy je w nowym kształcie.
// Uruchamiany ręcznie przez właściciela (z katalogu server/):
//   node scripts/migrate-drop-accounts.mjs
// Potem restart serwera (npm run dev / npm start).
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const exists = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts'`
  );
  if (!exists.rows[0]) {
    console.log('✔  Tabela accounts nie istnieje — nic do roboty');
  } else {
    // Guard bezpieczeństwa — gdyby jednak pojawiły się dane, nie dropować ślepo
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM accounts) AS accounts,
         (SELECT COUNT(*)::int FROM transactions) AS transactions,
         (SELECT COUNT(*)::int FROM recurring) AS recurring`
    );
    const { accounts, transactions, recurring } = counts.rows[0];
    if (accounts + transactions + recurring > 0) {
      console.error(
        `❌ W tabelach są dane (konta: ${accounts}, transakcje: ${transactions}, cykliczne: ${recurring}).` +
          ' Nie dropuję — potrzebna migracja z zachowaniem danych.'
      );
      process.exitCode = 1;
    } else {
      await pool.query('BEGIN');
      // Kolejność: najpierw tabele z FK do accounts, na końcu accounts
      await pool.query('DROP TABLE transactions');
      await pool.query('DROP TABLE recurring');
      await pool.query('DROP TABLE accounts');
      await pool.query('COMMIT');
      console.log('✔  Dropnięto accounts, transactions, recurring — restart serwera odtworzy je w nowym kształcie');
    }
  }
} catch (err) {
  await pool.query('ROLLBACK').catch(() => {});
  console.error('❌ Migracja wycofana:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
