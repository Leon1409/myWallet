// Jedno-offowy skrypt resetu hasła — uruchamiany ręcznie przez właściciela:
//   node scripts/reset-password.mjs <email> <noweHasło>
// Używa DATABASE_URL z server/.env, hasło soli+hashuje bcryptjs tak jak rejestracja.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Użycie: node scripts/reset-password.mjs <email> <noweHasło>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Hasło musi mieć co najmniej 8 znaków (spójnie z rejestracją)');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(
    "UPDATE users SET password_hash = $1 WHERE email = $2 AND email NOT LIKE '%@mywallet.local'",
    [hash, email.toLowerCase()]
  );
  if (r.rowCount === 0) {
    console.error(`Nie znaleziono konta z adresem ${email.toLowerCase()}`);
    process.exit(1);
  }
  console.log(`✔  Hasło zresetowane dla ${email.toLowerCase()} — możesz się zalogować`);
} finally {
  await pool.end();
}
