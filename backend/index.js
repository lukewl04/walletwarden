require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const app = express();

// Allow both dev ports for CORS
const corsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_ORIGIN
].filter(Boolean);

app.use(cors({ origin: corsOrigins }));
app.use(express.json());

// connect to Supabase Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});


// Ensure transactions table exists with proper schema
const ensureTables = async () => {
  try {
    // Check if table exists and has user_id column
    const checkTable = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'transactions' AND column_name = 'user_id'
    `);

    if (checkTable.rows.length === 0) {
      // Table exists but is missing user_id - drop and recreate
      console.log('Dropping old transactions table (missing user_id column)...');
      await pool.query('DROP TABLE IF EXISTS transactions CASCADE');
    }

    // Create table if missing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        date TIMESTAMPTZ NOT NULL,
        category TEXT,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Create splits table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS splits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        frequency TEXT NOT NULL,
        categories JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Create purchases table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        split_id TEXT NOT NULL,
        date TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    console.log('All tables ready');
  } catch (err) {
    console.error('Error ensuring tables:', err);
    throw err;
  }
};

// Auth0 JWT middleware - DISABLED FOR DEVELOPMENT
// const authCheck = jwt.expressjwt({
//   secret: jwksRsa.expressJwtSecret({
//     cache: true,
//     rateLimit: true,
//     jwksRequestsPerMinute: 5,
//     jwksUri: `${process.env.AUTH0_ISSUER_BASE_URL.replace(/\/$/, '')}/.well-known/jwks.json`,
//   }),
//   audience: process.env.AUTH0_AUDIENCE,
//   issuer: process.env.AUTH0_ISSUER_BASE_URL,
//   algorithms: ['RS256'],
// }).unless({ path: ['/health'] });

// app.use(authCheck);

// Mock middleware for development: extract user_id from Authorization header
app.use((req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  // For dev, treat token as user_id (in production, validate JWT properly)
  req.auth = { sub: token || 'dev-user-' + Date.now() };
  next();
});

// Error handling middleware for JWT errors
app.use((err, req, res, next) => {
  if (err instanceof jwt.UnauthorizedError) {
    console.error(`[${new Date().toISOString()}] JWT Error on ${req.method} ${req.path}:`, err.message);
    console.error('Authorization header:', req.headers.authorization ? 'present but invalid' : 'missing');
    return res.status(401).json({ error: 'unauthorized', message: err.message });
  }
  next(err);
});

// health
app.get('/health', (req, res) => res.json({ ok: true }));

// Get transactions for authenticated user
app.get('/api/transactions', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { rows } = await pool.query('SELECT id, type, amount::float, date, category, description FROM transactions WHERE user_id = $1 ORDER BY date DESC, created_at DESC', [userId]);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Bulk insert
app.post('/api/transactions/bulk', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const items = Array.isArray(req.body) ? req.body : (req.body?.transactions || []);
    if (!items.length) return res.status(400).json({ error: 'no_transactions' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const insertText = 'INSERT INTO transactions(id, user_id, type, amount, date, category, description) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING';
      for (const it of items) {
        await client.query(insertText, [it.id, userId, it.type, it.amount, it.date, it.category || null, it.description || null]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return res.json({ ok: true, inserted: items.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Single create
app.post('/api/transactions', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id, type, amount, date, category, description } = req.body;
    if (!id || !type || !amount || !date) return res.status(400).json({ error: 'invalid_payload' });

    await pool.query('INSERT INTO transactions(id, user_id, type, amount, date, category, description) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING', [id, userId, type, amount, date, category || null, description || null]);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// delete
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const id = req.params.id;
    await pool.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Splits endpoints
app.get('/api/splits', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { rows } = await pool.query(
      'SELECT id, name, frequency, categories, created_at FROM splits WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/splits', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id, name, frequency, categories } = req.body;
    if (!id || !name || !frequency || !categories) {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    await pool.query(
      'INSERT INTO splits(id, user_id, name, frequency, categories) VALUES($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name = $3, frequency = $4, categories = $5, updated_at = now()',
      [id, userId, name, frequency, JSON.stringify(categories)]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Purchases endpoints
app.get('/api/purchases', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { rows } = await pool.query(
      'SELECT id, split_id, date, amount::float, category, description FROM purchases WHERE user_id = $1 ORDER BY date DESC',
      [userId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/purchases', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id, split_id, date, amount, category, description } = req.body;
    if (!id || !split_id || !date || !amount || !category) {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    await pool.query(
      'INSERT INTO purchases(id, user_id, split_id, date, amount, category, description) VALUES($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET amount = $5, category = $6, description = $7',
      [id, userId, split_id, date, amount, category, description || null]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.delete('/api/purchases/:id', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    
    const id = req.params.id;
    await pool.query('DELETE FROM purchases WHERE id = $1 AND user_id = $2', [id, userId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// start
(async () => {
  await ensureTables();
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
  });
})();
