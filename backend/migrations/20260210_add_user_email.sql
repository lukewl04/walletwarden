-- Migration: Add email column to user_plans table
-- Date: 2026-02-10
-- Stores the user's email for admin dashboard lookups

ALTER TABLE user_plans
  ADD COLUMN IF NOT EXISTS email TEXT;
