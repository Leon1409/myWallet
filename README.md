# MyWallet — profesjonalna aplikacja do zarządzania budżetem domowym

Aplikacja w stylu Wallet: React (Vite) na froncie, Node.js + Express na backendu,
PostgreSQL jako baza danych. Wielużytkownikowa (JWT), interfejs po polsku, waluta PLN.

## Dlaczego PostgreSQL?

Do danych finansowych PostgreSQL jest lepszym wyborem niż MySQL:

- transakcyjność i spójność ACID — krytyczna dla pieniędzy,
- typ `NUMERIC` — dokładne wartości dziesiętne bez błędów zaokrągleń,
- constrainty CHECK i UNIQUE — integralność danych wymuszona w bazie, nie tylko w kodzie,
- `generate_series` i okna analityczne — statystyki i wykresy jednym zapytaniem,
- indeksy częściowe (np. tylko aktywne wpisy cykliczne) — szybszy scheduler.

## Funkcje

- rejestracja / logowanie (JWT, hasła bcrypt), każdy widzi wyłącznie swój budżet,
- wspólne budżety domowe: utwórz budżet, zaproś drugą osobę po e-mailu (zaproszenie
  pojawia się w jej aplikacji), przełączaj się między "Mój budżet" a budżetem domowym —
  członkowie widzą i dodają te same konta, transakcje, kategorie i budżety,
- transakcje: przychody, wydatki, opisy, daty, kategorie,
- przelewy między kontami (para powiązanych wpisów, kasowanie usuwa oba końce),
- konta i portfele z saldami początkowymi (bankowe, oszczędnościowe, gotówka, karty),
- kategorie z ikonami i kolorami + domyślny zestaw przy rejestracji,
- budżety miesięczne per kategoria z paskami postępu i alertami przekroczenia,
- statystyki: KPI, wykres słupkowy dzienny, donut wydatków wg kategorii, ostatnie transakcje,
- płatności cykliczne (tygodniowe/miesięczne) — serwer sam tworzy transakcje wg harmonogramu,
- eksport CSV (średnik + przecinek dziesiętny → otwiera się poprawnie w polskim Excelu),
- filtrowanie transakcji (miesiąc, typ, konto, kategoria, wyszukiwanie) + stronicowanie.

## Struktura

```
server/            API Node.js + Express
  src/routes/      auth, accounts, categories, transactions, budgets, recurring, stats
  src/services/    silnik płatności cyklicznych
  src/schema.js    idempotentny schemat bazy (tworzy się sam przy starcie)
client/            React 18 + Vite + Recharts
  src/pages/       Pulpit, Transakcje, Budżety, Konta, Kategorie, Cykliczne
```

## Wymagania

- Node.js 18+ (zalecane 20/22)
- PostgreSQL 14+ (lokalnie lub w chmurze — Neon, Supabase, Railway itp.)

## Uruchomienie

### 1. Baza PostgreSQL

Najprościej lokalnie przez Dockera:

```bash
docker run --name mywallet-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

albo utwórz bazę w chmurze i skopiuj connection string (SSL: dodaj `?sslmode=require`).

### 2. Backend

```bash
cd server
cp .env.example .env        # ustaw DATABASE_URL i długi losowy JWT_SECRET
npm install
npm run dev                 # http://localhost:4000 — schemat bazy tworzy się sam
```

### 3. Frontend

```bash
cd client
npm install
npm run dev                 # http://localhost:5173 (proxy /api -> localhost:4000)
```

Zarejestruj konto — dostaniesz domyślne kategorie i możesz zaczynać.

## API (skrót)

| Metoda | Endpoint | Opis |
|---|---|---|
| POST | /api/auth/register · /api/auth/login | rejestracja / logowanie (JWT) |
| GET | /api/auth/me | dane zalogowanego użytkownika |
| GET/POST/PATCH/DELETE | /api/accounts | konta z wyliczanym saldem |
| GET/POST/PATCH/DELETE | /api/categories | kategorie (blokada usunięcia w użyciu) |
| GET/POST/PATCH/DELETE | /api/transactions | filtry: from, to, accountId, categoryId, type, search, page |
| POST | /api/transactions/transfer | przelew między kontami |
| GET | /api/transactions/export | CSV (te same filtry) |
| GET/POST/PATCH/DELETE | /api/budgets | budżety per kategoria i miesiąc |
| GET/POST/PATCH/DELETE | /api/recurring | płatności cykliczne |
| GET/POST/PATCH/DELETE | /api/households | budżety domowe (tworzenie, zaproszenia, członkowie) |
| POST | /api/households/:id/leave · /invites/:id/accept · /invites/:id/decline | opuszczenie / przyjęcie / odrzucenie |
| GET | /api/stats/summary?month=RRRR-MM | KPI, serie dzienne, kategorie, konta, budżety |

Wszystkie endpointy poza rejestracją/logowaniem wymagają nagłówka
`Authorization: Bearer <token>`.

## Notatki techniczne

- kwoty przechowywane jako `NUMERIC(14,2)` — bez błędów float; daty przesyłane jako `YYYY-MM-DD`,
- przelew = dwa wpisy (wydatek + przychód) o wspólnym `transfer_id` w transakcji SQL — salda zawsze się zgadzają,
- scheduler cyklicznych odpala się przy starcie i co godzinę; nadrabia zaległe wpisy,
- usunięcie konta/kategorii w użyciu jest blokowane (HTTP 409) z czytelnym komunikatem,
- budżet domowy ma własnego ukrytego "użytkownika budżetowego" (`@mywallet.local`) —
  wszystkie endpointy danych działają bez zmian; nagłówek `X-Household-Id` przełącza
  kontekst (weryfikacja członkostwa w middleware JWT),
- produkcyjny build frontendu: `npm run build` w `client/` — jeśli istnieje `client/dist`,
  backend sam go serwuje (SPA z fallbackiem routingowym), więc cała aplikacja działa jako jeden proces Node.js.
