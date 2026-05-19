-- ============================================================
-- Migration: DB improvements  (2026-05-19)
-- Apply in Supabase SQL editor or via psql before restarting
-- the backend.  After applying, run: npx prisma generate
-- ============================================================

-- ── 1. Money fields: float8 → DECIMAL(12,2) ─────────────────
-- No data loss: existing float values are cast to exact decimal.

ALTER TABLE transactions
  ALTER COLUMN amount TYPE DECIMAL(12,2) USING amount::DECIMAL(12,2);

ALTER TABLE purchases
  ALTER COLUMN amount TYPE DECIMAL(12,2) USING amount::DECIMAL(12,2);

ALTER TABLE income_settings
  ALTER COLUMN expected_amount TYPE DECIMAL(12,2) USING expected_amount::DECIMAL(12,2);

ALTER TABLE bank_accounts
  ALTER COLUMN balance           TYPE DECIMAL(12,2) USING balance::DECIMAL(12,2),
  ALTER COLUMN available_balance TYPE DECIMAL(12,2) USING available_balance::DECIMAL(12,2);

ALTER TABLE bank_balance_snapshots
  ALTER COLUMN total_balance     TYPE DECIMAL(12,2) USING total_balance::DECIMAL(12,2),
  ALTER COLUMN available_balance TYPE DECIMAL(12,2) USING available_balance::DECIMAL(12,2);


-- ── 2. Transaction bank-sync fields ──────────────────────────
-- These are NULL for all existing manual/CSV transactions.
-- New TrueLayer syncs will populate them.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bank_account_id         TEXT,
  ADD COLUMN IF NOT EXISTS provider                TEXT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;

-- Index for FK lookups
CREATE INDEX IF NOT EXISTS idx_transactions_bank_account_id
  ON transactions(bank_account_id);

-- Index used by the Prisma @@index on [user_id, provider, provider_transaction_id]
CREATE INDEX IF NOT EXISTS idx_transactions_bank_sync
  ON transactions(user_id, provider, provider_transaction_id);

-- Partial unique index: prevents duplicate bank imports.
-- Manual/CSV transactions have provider_transaction_id = NULL and are NOT affected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_sync_dedup
  ON transactions(user_id, provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- FK from transactions.bank_account_id -> bank_accounts.id
-- ON DELETE SET NULL: deleting a bank account nulls the FK on old transactions, no cascade.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_transactions_bank_account'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_bank_account
      FOREIGN KEY (bank_account_id)
      REFERENCES bank_accounts(id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- ── 3. Bank connection: encrypt access token ─────────────────
-- Access tokens are now stored encrypted (AES-256-GCM) using
-- the same pattern as the refresh token.
-- The plaintext access_token column is kept nullable for
-- backward compatibility with existing connections; it will be
-- cleared on the next successful token refresh or reconnect.

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS encrypted_access_token TEXT,
  ADD COLUMN IF NOT EXISTS access_token_iv        TEXT,
  ADD COLUMN IF NOT EXISTS access_token_tag       TEXT;

-- Make the old plaintext column nullable so the code can set it to NULL
ALTER TABLE bank_connections
  ALTER COLUMN access_token DROP NOT NULL;


-- ── 4. user_plans safety ─────────────────────────────────────
-- user_id is already UNIQUE (added in an earlier migration).
-- No schema change required.
-- The email column is intentionally kept for Stripe lookup
-- convenience; source of truth remains users.email.


-- ── 5. Splits categories: TEXT → JSONB ───────────────────────
-- Existing rows contain valid JSON strings (e.g. '["Food","Transport"]').
-- Casting to JSONB preserves the arrays in-place.

ALTER TABLE splits
  ALTER COLUMN categories TYPE JSONB USING categories::JSONB;


-- ── 6. Table/model naming ─────────────────────────────────────
-- No misspelling found.  The 'transactions' table name is correct.
-- No change needed.
