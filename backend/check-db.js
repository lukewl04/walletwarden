require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

async function main() {
  // Update all dev-user transactions to the real Auth0 user
  const result = await p.transaction.updateMany({
    where: { user_id: 'dev-user' },
    data: { user_id: 'google-oauth2|104204754376121190784' }
  });
  console.log('Updated', result.count, 'transactions to Auth0 user ID');
  
  // Verify
  const count = await p.transaction.count({
    where: { user_id: 'google-oauth2|104204754376121190784' }
  });
  console.log('Total transactions for Auth0 user:', count);
  
  await p.$disconnect();
  await pool.end();
}

main().catch(console.error);
