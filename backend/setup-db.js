#!/usr/bin/env node

/**
 * Database setup script for WalletWarden
 * This pushes the Prisma schema to the database
 */

const { execSync } = require('child_process');

console.log('🔧 Setting up WalletWarden database...\n');

try {
  console.log('� Generating Prisma client...');
  execSync('npx prisma generate', { stdio: 'inherit' });

  console.log('\n�📊 Pushing schema to database...');
  execSync('npx prisma db push', { stdio: 'inherit' });
  
  console.log('\n✅ Database setup complete!');
  console.log('\nYour database now has:');
  console.log('  ✓ transactions table');
  console.log('  ✓ splits table');
  console.log('  ✓ purchases table');
  console.log('  ✓ income_settings table');
  console.log('  ✓ bank_connections table (for open banking)');
  console.log('  ✓ bank_accounts table (for bank account tracking)');
  console.log('  ✓ user_plans table (subscriptions, email, roles)');
  console.log('  ✓ bank_connection_usage table');
  console.log('\nYou can now connect your bank account via open banking!');
} catch (error) {
  console.error('❌ Database setup failed:', error.message);
  process.exit(1);
}
