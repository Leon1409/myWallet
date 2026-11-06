import db from './db.js';

// Idempotentny schemat bazy — wykonuje się przy każdym starcie serwera
const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  color      TEXT NOT NULL DEFAULT '#635bff',
  icon       TEXT NOT NULL DEFAULT '📦',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bez kont bankowych — liczymy przychody/wydatki ogólnie, bez kontekstu karty/konta
CREATE TABLE IF NOT EXISTS transactions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  date        DATE NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budżet miesięczny: JEDEN limit wydatków na miesiąc (bez podziału na kategorie).
-- Wydatki kategoryzują same transakcje — budżet pilnuje całości miesiąca.
CREATE TABLE IF NOT EXISTS budgets (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      DATE NOT NULL,
  amount     NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

CREATE TABLE IF NOT EXISTS recurring (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  frequency   TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  next_date   DATE NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budżet domowy: user_id to ukryty "użytkownik budżetowy" domu — dane
-- (konta, transakcje itd.) należą do niego, a członkowie działają w jego imieniu.
CREATE TABLE IF NOT EXISTS households (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS household_members (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  is_default   BOOLEAN NOT NULL DEFAULT false,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

CREATE TABLE IF NOT EXISTS household_invites (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  token        UUID NOT NULL DEFAULT gen_random_uuid(),
  status       TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  invited_by   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Listy zakupowe budżetu domowego; "wysłanie do kogoś" to przypisanie
-- domownika (assignee_id) — NULL oznacza listę dla całego domu.
CREATE TABLE IF NOT EXISTS shopping_lists (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_id    BIGINT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  quantity   TEXT,
  bought     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zdjęcia paragonów (sparsowane przez AI, podpięte do transakcji zbiorczej).
-- Bez transaction_id do czasu zatwierdzenia importu — sieroty (porzucone
-- parsowanie / transakcja usunięta) sprząta zegar po dobie.
CREATE TABLE IF NOT EXISTS receipts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image      BYTEA NOT NULL,
  mime       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Doposażenie istniejących instalacji (idempotentne; PG 9.6+)
ALTER TABLE household_members ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_id BIGINT REFERENCES receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_user   ON categories (user_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_date      ON transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_category       ON transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_tx_receipt        ON transactions (receipt_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets (user_id, month);
CREATE INDEX IF NOT EXISTS idx_recurring_active  ON recurring (next_date) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_hh_members_user   ON household_members (user_id);
-- Jeden domyślny budżet domowy na użytkownika (partial unique — jak filtered index w T-SQL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_hh_members_default ON household_members (user_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_hh_invites_email  ON household_invites (email) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_hh_invites_pending
  ON household_invites (household_id, email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_shop_lists_hh ON shopping_lists (household_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_lists_assignee ON shopping_lists (assignee_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_shop_items_list ON shopping_list_items (list_id);
`;

export async function ensureSchema() {
  await db.query(DDL);
}
