# myWallet — kontekst projektu

## Co to jest
Osobista aplikacja do zarządzania budżetem domowym (portfel). Właściciel: Łukasz (konto id=2, lukaszleonarczyk@gmail.com).

## Stack
- **Server** (`server/`): Node ESM, Express, `pg` (node-postgres), bcryptjs, jsonwebtoken, helmet, cors, dotenv. Start: `npm start` (w `server/`).
- **Client** (`client/`): React + Vite (`client/src/pages/` — Dashboard, Transactions, Budgets, Categories, Recurring, Households, Shopping, Login, Register).
- **DB**: PostgreSQL 13.20, baza `39582406_mywallet` (nazwa sugeruje hosting z panelu — możliwe home.pl, niepotwierdzone). Dostęp narzędziowy: **read-only**.

## Architektura bazy
- Źródło prawdy schematu: **`server/src/schema.js`** — idempotentny DDL (`CREATE TABLE/INDEX IF NOT EXISTS`) wykonywany przy każdym starcie serwera przez `ensureSchema()`.
- 10 tabel: users, categories, transactions, budgets, recurring, households, household_members, household_invites, shopping_lists, shopping_list_items. **Brak kont bankowych** — liczymy przychody/wydatki ogólnie, bez kontekstu karty/konta (stąd też brak przelewów międzykontowych).
- Klucze: `BIGINT GENERATED ALWAYS AS IDENTITY` (pod spodem sekwencje `<tabela>_id_seq`).
- Użyte paterny: partial indexes (np. `idx_recurring_active` na `next_date WHERE active`), unique composite, FK z `ON DELETE CASCADE` / `SET NULL`.
- Ficzery: budżety domowe — `households.user_id` to ukryty "użytkownik budżetowy" domu; członkowie działają w jego imieniu. Zaproszenia: token UUID, status pending/accepted/declined/revoked.
- Ficzery: listy zakupów (`shopping_lists` + `shopping_list_items`) — zawsze widoczne we **wszystkich** moich budżetach domowych (API `/api/shopping-lists`, dostęp = członkostwo w domu listy, **nie** nagłówek `X-Household-Id`); "wysłanie do kogoś" = `assignee_id` (NULL = dla całego domu). Gdy domownik odchodzi/usunięty → `assignee_id` czyszczone (households.js).
- Budżety: **jeden miesięczny limit wydatków** na budżet (osobisty/domowy) — `budgets` = (user_id, month, amount) z UNIQUE(user_id, month); **bez podziału na kategorie** (wydatki kategoryzują transakcje). Ustawianie przez upsert `ON CONFLICT`.
- Jedno-offowe skrypty (uruchamiane ręcznie przez właściciela): `server/scripts/reset-password.mjs <email> <noweHasło>`, `server/scripts/migrate-budgets-monthly.mjs` (przekształcenie starych budżetów per kategoria → limit miesięczny), `server/scripts/migrate-drop-accounts.mjs` (usunięcie kont z modelu — drop pustych accounts/transactions/recurring).
- `db.js`: pool (max 10), helper `withClient(fn)` z BEGIN/COMMIT/ROLLBACK; DATE parsowany jako string `YYYY-MM-DD` (setTypeParser 1082).

## Ustalenia / workflow
- **Nie edytować bazy bezpośrednio** — zmiany schematu idą przez `schema.js`; ALTER-y na żywej bazie → jedno-offowy skrypt SQL wykonywany ręcznie przez właściciela.
- Migracje: na razie zostajemy przy `schema.js`. Sygnał do zmiany: pierwszy ALTER istniejącej tabeli na bazie z danymi albo drugie środowisko. Wtedy: zamrozić schemat jako migrację bazową i przejść na **node-pg-migrate** (pasuje do czystego `pg`, bez ORM).

## Profil użytkownika
- Zaawansowany w **T-SQL (SQL Server)**, początkujący w PostgreSQL → wyjaśniać przez porównania z MS SQL (np. IDENTITY→sequence, TOP→LIMIT, NOLOCK→MVCC, filtered→partial indexes).
- Komunikacja po polsku.
- Nie zakładać znajomości konwencji ekosystemu JS/Node.

## Deployment (stan: nie rozstrzygnięty)
- Owner ma hosting **home.pl** — brak Node na hostingu współdzielonym; home.pl tylko domena/DNS/mail.
- Rozważane opcje: **Render + Neon** (najszybciej), **Fly.io** (tanio), **VPS Hetzner + Caddy** (pełna kontrola; owner techniczny — ta opcja rekomendowana do nauki).
- Do ogarnięcia przy wdrożeniu: serwowanie builda Vite przez `express.static` z serwera, sekrety przez env (`DATABASE_URL`, JWT secret), backupy (pg_dump cron / wbudowane w Neon).
- Zaoferowane: przygotuję pliki wdrożeniowe (Dockerfile + Caddyfile lub render.yaml) po decyzji.

## Otwarte tematy / następne kroki
1. Wybór opcji deploymentu → przygotowanie configów.
2. Przejście na migracje gdy przyjdzie czas (patrz wyżej).
3. Ewentualne zmiany schematu na życzenie właściciela (przez schema.js).

## Konwencje w rozmowie
- Odpowiedzi zwięzłe, po polsku.
- **Myśleć po polsku** — analizować, planować i wnioskować po polsku, nie tylko odpowiadać po polsku (w kodzie: identyfikatory po angielsku, komentarze po polsku — jak dotychczas).
- Przy tematach PG — tabelki porównawcze T-SQL ↔ PostgreSQL są u właściciela dobrze przyjęte.
