-- Migration: Add subscription tier system
-- Date: 2026-02-09

-- 1. User plans table - single source of truth for a user's subscription
CREATE TABLE IF NOT EXISTS user_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'plus', 'pro')),
  -- Stripe integration (abstracted from plan logic)
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  -- Lifecycle
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,              -- NULL = active indefinitely (or until cancelled)
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON user_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_stripe_customer ON user_plans(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- 2. Weekly bank connection usage counters
CREATE TABLE IF NOT EXISTS bank_connection_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  week_start  DATE NOT NULL,              -- Monday of the ISO week (for consistent bucketing)
  connections_used INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_bank_usage_user_week ON bank_connection_usage(user_id, week_start);

-- 3. Enable RLS
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connection_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies (service role bypasses, but good practice)
DO $$ BEGIN
  CREATE POLICY "Users can read own plan"
    ON user_plans FOR SELECT
    USING (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can read own usage"
    ON bank_connection_usage FOR SELECT
    USING (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
