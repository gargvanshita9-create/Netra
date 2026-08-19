-- Retail banking schema — the business-shaped seed dataset for Phase 0/1
-- development and demos (PROJECT_PLAN.md §4.2, P0.7). Chosen over a generic
-- e-commerce sample to match the BFSI domain the product targets.
--
-- Row-count targets (see scripts/generate-seed-data.ts):
--   customers ~3,000, accounts ~4,500, transactions ~20,000 (fact table).

CREATE TABLE branches (
  id            INTEGER PRIMARY KEY,
  branch_code   TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  city          TEXT NOT NULL,
  state         TEXT NOT NULL,
  region        TEXT NOT NULL,
  opened_date   DATE NOT NULL
);

CREATE TABLE employees (
  id            INTEGER PRIMARY KEY,
  branch_id     INTEGER NOT NULL REFERENCES branches (id),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  role          TEXT NOT NULL,
  hire_date     DATE NOT NULL
);

CREATE TABLE customers (
  id            INTEGER PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  segment       TEXT NOT NULL CHECK (segment IN ('retail', 'premium', 'business')),
  city          TEXT NOT NULL,
  state         TEXT NOT NULL,
  kyc_verified  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE products (
  id             INTEGER PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL CHECK (
    category IN ('savings', 'current', 'fixed_deposit', 'personal_loan', 'home_loan', 'credit_card')
  ),
  interest_rate  NUMERIC(5, 2)
);

CREATE TABLE accounts (
  id             INTEGER PRIMARY KEY,
  account_number TEXT NOT NULL UNIQUE,
  customer_id    INTEGER NOT NULL REFERENCES customers (id),
  branch_id      INTEGER NOT NULL REFERENCES branches (id),
  product_id     INTEGER NOT NULL REFERENCES products (id),
  account_type   TEXT NOT NULL CHECK (account_type IN ('savings', 'current', 'fixed_deposit')),
  status         TEXT NOT NULL CHECK (status IN ('active', 'dormant', 'closed')),
  opened_date    DATE NOT NULL,
  balance        NUMERIC(14, 2) NOT NULL
);

CREATE TABLE cards (
  id                  INTEGER PRIMARY KEY,
  account_id          INTEGER NOT NULL REFERENCES accounts (id),
  card_number_masked  TEXT NOT NULL,
  card_type           TEXT NOT NULL CHECK (card_type IN ('debit', 'credit')),
  issued_date         DATE NOT NULL,
  expiry_date         DATE NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('active', 'blocked', 'expired')),
  credit_limit        NUMERIC(12, 2)
);

CREATE TABLE loans (
  id               INTEGER PRIMARY KEY,
  customer_id      INTEGER NOT NULL REFERENCES customers (id),
  branch_id        INTEGER NOT NULL REFERENCES branches (id),
  product_id       INTEGER NOT NULL REFERENCES products (id),
  principal_amount NUMERIC(14, 2) NOT NULL,
  interest_rate    NUMERIC(5, 2) NOT NULL,
  term_months      INTEGER NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('active', 'closed', 'default')),
  disbursed_date   DATE NOT NULL
);

CREATE TABLE loan_payments (
  id                    INTEGER PRIMARY KEY,
  loan_id               INTEGER NOT NULL REFERENCES loans (id),
  payment_date          DATE NOT NULL,
  amount                NUMERIC(12, 2) NOT NULL,
  principal_component   NUMERIC(12, 2) NOT NULL,
  interest_component    NUMERIC(12, 2) NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('on_time', 'late', 'missed'))
);

-- Fact table: ≥10k rows (P0.7 acceptance criterion).
CREATE TABLE transactions (
  id            BIGINT PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts (id),
  txn_date      TIMESTAMPTZ NOT NULL,
  txn_type      TEXT NOT NULL CHECK (
    txn_type IN ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'fee', 'interest')
  ),
  amount        NUMERIC(14, 2) NOT NULL,
  balance_after NUMERIC(14, 2) NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('branch', 'atm', 'online', 'mobile', 'upi')),
  description   TEXT
);

CREATE INDEX idx_employees_branch_id ON employees (branch_id);
CREATE INDEX idx_accounts_customer_id ON accounts (customer_id);
CREATE INDEX idx_accounts_branch_id ON accounts (branch_id);
CREATE INDEX idx_cards_account_id ON cards (account_id);
CREATE INDEX idx_loans_customer_id ON loans (customer_id);
CREATE INDEX idx_loan_payments_loan_id ON loan_payments (loan_id);
CREATE INDEX idx_transactions_account_id ON transactions (account_id);
CREATE INDEX idx_transactions_txn_date ON transactions (txn_date);
