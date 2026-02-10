/**
 * grant-admin.js — Helper script to grant admin role to a user
 * 
 * Usage: node grant-admin.js <user_id>
 * Example: node grant-admin.js auth0|123abc456def
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const userId = process.argv[2];

if (!userId) {
  console.error('❌ Error: User ID required');
  console.error('Usage: node grant-admin.js <user_id>');
  console.error('Example: node grant-admin.js auth0|123abc456def');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function grantAdmin() {
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log(`\n🔍 Checking user: ${userId}`);

    // Check if user exists
    let user = await prisma.userPlan.findUnique({
      where: { user_id: userId },
    });

    if (user) {
      console.log(`✓ Found user with plan: ${user.plan}, role: ${user.role}`);
      
      if (user.role === 'admin') {
        console.log('ℹ User already has admin role');
      } else {
        // Update to admin
        user = await prisma.userPlan.update({
          where: { user_id: userId },
          data: { role: 'admin' },
        });
        console.log('✓ Granted admin role to user');
      }
    } else {
      // Create new user with admin role
      user = await prisma.userPlan.create({
        data: {
          user_id: userId,
          plan: 'free',
          role: 'admin',
        },
      });
      console.log('✓ Created new user with admin role');
    }

    console.log('\n📊 User details:');
    console.log(`  User ID: ${user.user_id}`);
    console.log(`  Plan: ${user.plan}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Created: ${user.created_at}`);
    console.log('\n✅ Admin access granted successfully!\n');

  } catch (err) {
    console.error('❌ Error granting admin:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

grantAdmin();
