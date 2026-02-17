#!/usr/bin/env node

/**
 * Setup the database schema by pushing Prisma schema to the database
 * This ensures all tables and models are created
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("❌ DATABASE_URL is not set");
    process.exit(1);
  }

  console.log("📦 Setting up database schema...");
  console.log("🔌 Connecting to database...");

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Test connection
    const result = await prisma.$queryRaw`SELECT NOW()`;
    console.log("✅ Database connection successful");

    // Create tables if they don't exist
    console.log("📝 Creating tables from schema...");

    // Create Transaction table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount FLOAT NOT NULL,
        date TIMESTAMP NOT NULL,
        category TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT transactions_user_id_idx UNIQUE(id)
      )
    `;
    console.log("✅ transactions table created/verified");

    // Create Split table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS splits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        frequency TEXT NOT NULL,
        categories TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log("✅ splits table created/verified");

    // Create Purchase table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        split_id TEXT NOT NULL,
        transaction_id TEXT,
        date TIMESTAMP NOT NULL,
        amount FLOAT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log("✅ purchases table created/verified");

    // Create IncomeSetting table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS income_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        split_id TEXT NOT NULL UNIQUE,
        expected_amount FLOAT DEFAULT 0,
        frequency TEXT DEFAULT 'monthly',
        next_payday TEXT,
        use_expected_when_no_actual BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log("✅ income_settings table created/verified");

    // Create BankConnection table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS bank_connections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT DEFAULT 'truelayer',
        access_token TEXT NOT NULL,
        encrypted_refresh_token TEXT,
        refresh_token_iv TEXT,
        refresh_token_tag TEXT,
        token_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, provider)
      )
    `;
    console.log("✅ bank_connections table created/verified");

    // Create BankAccount table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT DEFAULT 'truelayer',
        provider_account_id TEXT NOT NULL,
        account_name TEXT,
        currency TEXT,
        balance FLOAT,
        available_balance FLOAT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, provider, provider_account_id)
      )
    `;
    console.log("✅ bank_accounts table created/verified");

    // Create user_plans table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS user_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL UNIQUE,
        email TEXT,
        plan TEXT NOT NULL DEFAULT 'free',
        role TEXT NOT NULL DEFAULT 'user',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        plan_status TEXT,
        plan_current_period_end TIMESTAMPTZ,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    console.log("✅ user_plans table created/verified");

    // Add email and role columns if they don't exist (for existing installs)
    await prisma.$executeRaw`ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS email TEXT`;
    await prisma.$executeRaw`ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`;
    console.log("✅ user_plans email & role columns verified");

    // Create bank_connection_usage table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS bank_connection_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        week_start DATE NOT NULL,
        connections_used INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(user_id, week_start)
      )
    `;
    console.log("✅ bank_connection_usage table created/verified");

    // Enable RLS
    console.log("🔐 Enabling Row Level Security...");
    await prisma.$executeRaw`ALTER TABLE transactions ENABLE ROW LEVEL SECURITY`;
    await prisma.$executeRaw`ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY`;
    await prisma.$executeRaw`ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY`;
    console.log("✅ RLS enabled");

    console.log("\n✨ Database schema setup complete!");
  } catch (error) {
    console.error("❌ Error setting up database schema:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
