-- Enable RLS and block anon for transactions, bank_connections, accounts

-- 1. Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- 2. Remove all existing policies (if any)
DROP POLICY IF EXISTS "Allow all" ON transactions;
DROP POLICY IF EXISTS "Allow all" ON bank_connections;
DROP POLICY IF EXISTS "Allow all" ON bank_accounts;

-- 3. Block anon (no SELECT/INSERT/UPDATE/DELETE for anon)
-- (No policies for anon, so all access is denied)

-- 4. Optionally, allow service_role (bypass RLS)
-- Service role bypasses RLS by default in Supabase, so no explicit policy needed.

-- 5. (Optional) If you ever want to allow authenticated users, add explicit policies for them only.

-- 6. Verify
-- SELECT * FROM pg_policies WHERE tablename IN ('transactions','bank_connections','bank_accounts');
