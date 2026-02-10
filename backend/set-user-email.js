/**
 * set-user-email.js — Helper script to set email for a user
 * 
 * Usage: node set-user-email.js <user_id> <email>
 * Example: node set-user-email.js "google-oauth2|123" "user@example.com"
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const userId = process.argv[2];
const email = process.argv[3];

if (!userId || !email) {
  console.error('❌ Error: User ID and email required');
  console.error('Usage: node set-user-email.js <user_id> <email>');
  console.error('Example: node set-user-email.js "google-oauth2|123" "user@example.com"');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function setEmail() {
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log(`\n🔍 Setting email for user: ${userId}`);
    console.log(`📧 Email: ${email}\n`);

    const user = await prisma.userPlan.upsert({
      where: { user_id: userId },
      update: { email },
      create: {
        user_id: userId,
        email,
        plan: 'free',
        role: 'user',
      },
    });

    console.log('✓ Email updated successfully!\n');
    console.log('📊 User details:');
    console.log(`  User ID: ${user.user_id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Plan: ${user.plan}`);
    console.log(`  Role: ${user.role}\n`);

  } catch (err) {
    console.error('❌ Error setting email:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

setEmail();
