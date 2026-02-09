require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const userId = 'google-oauth2|104204754376121190784';
  
  // Check purchase categories
  const cats = await pool.query(
    'SELECT category, count(*) as cnt FROM purchases WHERE user_id=$1 GROUP BY category ORDER BY cnt DESC',
    [userId]
  );
  console.log('=== Purchase categories ===');
  cats.rows.forEach(r => console.log(`  ${r.category}: ${r.cnt}`));

  // Check split categories
  const splits = await pool.query(
    'SELECT id, name, categories FROM splits WHERE user_id=$1',
    [userId]
  );
  console.log('\n=== Splits ===');
  splits.rows.forEach(r => {
    const parsed = JSON.parse(r.categories);
    console.log(`  ${r.name} (${r.id}): ${parsed.map(c => c.name).join(', ')}`);
  });

  // Check recent purchases
  const recent = await pool.query(
    "SELECT date, amount, category, description FROM purchases WHERE user_id=$1 AND category != 'Income' ORDER BY date DESC LIMIT 10",
    [userId]
  );
  console.log('\n=== Recent purchases ===');
  recent.rows.forEach(r => console.log(`  ${r.date.toISOString().slice(0,10)} £${r.amount} [${r.category}] ${r.description}`));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
