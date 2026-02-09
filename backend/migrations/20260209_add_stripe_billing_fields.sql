-- Migration: Add Stripe billing fields to user_plans
-- Date: 2026-02-09
-- Adds plan_status and plan_current_period_end for webhook-driven entitlements.
-- Does NOT touch any existing role/permission columns.

ALTER TABLE user_plans
  ADD COLUMN IF NOT EXISTS plan_status               TEXT,
  ADD COLUMN IF NOT EXISTS plan_current_period_end    TIMESTAMPTZ;

-- Index for webhook lookups by stripe_subscription_id
CREATE INDEX IF NOT EXISTS idx_user_plans_stripe_sub
  ON user_plans(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
