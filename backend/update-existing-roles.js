/**
 * update-existing-roles.js — One-time script to update existing users with default role
 * 
 * Usage: node update-existing-roles.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function updateRoles() {
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('\n🔄 Updating existing users with default role...\n');

    // Use raw SQL to update null roles to 'user'
    const result = await prisma.$executeRaw`
      UPDATE user_plans 
      SET role = 'user' 
      WHERE role IS NULL
    `;

    console.log(`✓ Updated ${result} user(s) to have 'user' role\n`);

    // Show updated users
    const users = await prisma.userPlan.findMany({
      select: { user_id: true, plan: true, role: true },
      orderBy: { created_at: 'desc' },
    });

    console.log('Current users:');
    users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.user_id.slice(0, 30)}... - ${user.plan} - ${user.role}`);
    });

    console.log('\n✅ Done!\n');

  } catch (err) {
    console.error('❌ Error updating roles:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

updateRoles();
