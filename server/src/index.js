import 'dotenv/config';
import app from './app.js';
import { ensureSchema } from './schema.js';
import { processRecurring } from './services/recurring.js';

if (!process.env.DATABASE_URL) {
  console.error('❌  Brak DATABASE_URL — utworz plik server/.env na podstawie .env.example');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET nie jest ustawiony — ustaw go w .env przed wdrożeniem!');
}

const PORT = process.env.PORT || 4000;

async function main() {
  await ensureSchema();
  console.log('✔  Schemat bazy gotowy');

  try {
    const n = await processRecurring();
    if (n > 0) console.log(`🔁  Utworzono ${n} transakcji cyklicznych`);
  } catch (err) {
    console.error('Błąd przetwarzania transakcji cyklicznych:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`🚀  API: http://localhost:${PORT}`);
  });

  // Zegar cyklicznych — co godzinę
  setInterval(async () => {
    try {
      await processRecurring();
    } catch (err) {
      console.error('Błąd zegara cyklicznych:', err.message);
    }
  }, 60 * 60 * 1000);
}

main().catch((err) => {
  console.error('Nie udało się uruchomić serwera:', err.message);
  process.exit(1);
});
