/**
 * Applies the pending SQL migration to Supabase.
 * Run once: node run-migration.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const migrationFile = path.join(__dirname, 'migrations', '20260519_db_improvements.sql');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  // Use a direct (non-pooled) connection for DDL statements.
  // If DATABASE_URL is the pooled URL (pgbouncer), swap it for the direct one.
  const connStr = (process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL)
    .replace('pgbouncer=true', '');

  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

  const sql = fs.readFileSync(migrationFile, 'utf8');

  // Split on semicolons that end a top-level statement.
  // Handles PL/pgSQL DO $$ ... $$ blocks by treating their internal semicolons as non-splitting.
  const statements = [];
  let current = '';
  let dollarDepth = 0;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    // Count $$ delimiters to track whether we're inside a dollar-quoted block
    const dollars = (trimmed.match(/\$\$/g) || []).length;
    dollarDepth += dollars;
    current += line + '\n';
    // A statement ends on ';' only when we're at the top level (dollarDepth even → outside block)
    if (dollarDepth % 2 === 0 && trimmed.endsWith(';')) {
      // Strip leading comment lines so the startsWith('--') check works correctly
      const strippedLines = current.trim().split('\n').filter(l => !l.trim().startsWith('--'));
      const s = strippedLines.join('\n').trim().replace(/;$/, '').trim();
      if (s.length > 0) statements.push(s);
      current = '';
    }
  }
  // Handle any trailing non-terminated block
  if (current.trim().length > 0) {
    const strippedLines = current.trim().split('\n').filter(l => !l.trim().startsWith('--'));
    const s = strippedLines.join('\n').trim();
    if (s.length > 0) statements.push(s);
  }

  console.log(`\n📋 Applying ${statements.length} statements from ${migrationFile}...\n`);

  const client = await pool.connect();
  let ok = 0;
  let skipped = 0;

  try {
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        console.log(`  ✅ ${stmt.slice(0, 80).replace(/\s+/g, ' ')}…`);
        ok++;
      } catch (err) {
        // "already exists" or "does not exist" type errors are safe to skip
        if (
          err.code === '42701' || // duplicate_column
          err.code === '42P07' || // duplicate_table
          err.code === '42710' || // duplicate_object (index, constraint)
          err.message.includes('already exists')
        ) {
          console.log(`  ⚠️  Skipped (already applied): ${stmt.slice(0, 80).replace(/\s+/g, ' ')}…`);
          skipped++;
        } else {
          console.error(`\n  ❌ Failed on statement:\n${stmt}\n\nError: ${err.message}`);
          throw err;
        }
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`\n✅ Migration complete: ${ok} applied, ${skipped} already existed.\n`);
  console.log('Next step: restart your backend with   node .\n');
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
