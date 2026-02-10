/**
 * list-users.js — Helper script to list all users in the system
 * 
 * Usage: node list-users.js
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

async function listUsers() {
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('\n📊 Listing all users...\n');

    const users = await prisma.userPlan.findMany({
      orderBy: { created_at: 'desc' },
    });

    if (users.length === 0) {
      console.log('No users found in database.');
    } else {
      console.log(`Found ${users.length} user(s):\n`);
      
      users.forEach((user, index) => {
        console.log(`${index + 1}. User ID: ${user.user_id}`);
        console.log(`   Plan: ${user.plan}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Status: ${user.plan_status || 'N/A'}`);
        console.log(`   Created: ${user.created_at.toISOString().split('T')[0]}`);
        console.log('');
      });

      const adminCount = users.filter(u => u.role === 'admin').length;
      console.log(`Total: ${users.length} users (${adminCount} admin${adminCount !== 1 ? 's' : ''})`);
    }

    console.log('\n💡 To grant admin access, run:');
    console.log('   node grant-admin.js <user_id>\n');

  } catch (err) {
    console.error('❌ Error listing users:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

listUsers();
