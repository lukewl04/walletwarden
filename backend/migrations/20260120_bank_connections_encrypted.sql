-- Migration: Update bank_connections for encrypted refresh token
ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS encrypted_refresh_token text,
  ADD COLUMN IF NOT EXISTS refresh_token_iv text,
  ADD COLUMN IF NOT EXISTS refresh_token_tag text;

-- Remove old plaintext refresh_token column if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='bank_connections' AND column_name='refresh_token'
  ) THEN
    ALTER TABLE bank_connections DROP COLUMN refresh_token;
  END IF;
END $$;
