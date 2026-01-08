require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Database = require('better-sqlite3');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const path = require('path');

const app = express();

// Allow both dev ports for CORS
const corsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_ORIGIN
].filter(Boolean);

app.use(cors({ origin: corsOrigins }));
app.use(express.json());

// SQLite database for local development
const db = new Database(path.join(__dirname, 'walletwarden.db'));
db.pragma('journal_mode = WAL');


// Ensure tables exist with proper schema
const ensureTables = () => {
  try {
    // Create transactions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        category TEXT,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create splits table
    db.exec(`
      CREATE TABLE IF NOT EXISTS splits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        frequency TEXT NOT NULL,
        categories TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create purchases table
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        split_id TEXT NOT NULL,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('All tables ready (SQLite)');
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

    const rows = db.prepare('SELECT id, type, amount, date, category, description FROM transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(userId);
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

    const insert = db.prepare('INSERT OR IGNORE INTO transactions(id, user_id, type, amount, date, category, description) VALUES(?, ?, ?, ?, ?, ?, ?)');
    
    const insertMany = db.transaction((items) => {
      for (const it of items) {
        insert.run(it.id, userId, it.type, it.amount, it.date, it.category || null, it.description || null);
      }
    });
    
    insertMany(items);

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

    db.prepare('INSERT OR IGNORE INTO transactions(id, user_id, type, amount, date, category, description) VALUES(?, ?, ?, ?, ?, ?, ?)').run(id, userId, type, amount, date, category || null, description || null);
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
    db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId);
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

    const rows = db.prepare('SELECT id, name, frequency, categories, created_at FROM splits WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    // Parse JSON categories
    const parsed = rows.map(r => ({ ...r, categories: JSON.parse(r.categories) }));
    return res.json(parsed);
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

    db.prepare(
      'INSERT OR REPLACE INTO splits(id, user_id, name, frequency, categories, updated_at) VALUES(?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
    ).run(id, userId, name, frequency, JSON.stringify(categories));
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

    const rows = db.prepare('SELECT id, split_id, date, amount, category, description FROM purchases WHERE user_id = ? ORDER BY date DESC').all(userId);
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

    db.prepare(
      'INSERT OR REPLACE INTO purchases(id, user_id, split_id, date, amount, category, description) VALUES(?, ?, ?, ?, ?, ?, ?)'
    ).run(id, userId, split_id, date, amount, category, description || null);
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
    db.prepare('DELETE FROM purchases WHERE id = ? AND user_id = ?').run(id, userId);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Reset everything for the current user (transactions, splits, purchases)
app.post('/api/reset', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const txResult = db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
    const purchaseResult = db.prepare('DELETE FROM purchases WHERE user_id = ?').run(userId);
    const splitResult = db.prepare('DELETE FROM splits WHERE user_id = ?').run(userId);

    return res.json({
      ok: true,
      cleared: {
        transactions: txResult.changes,
        purchases: purchaseResult.changes,
        splits: splitResult.changes,
      },
    });
  } catch (err) {
    console.error('Error resetting user data:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// start
ensureTables();
const port = process.env.PORT || 4000;
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Backend running on http://localhost:${port} (SQLite)`);
  console.log(`Server is listening and ready for connections...`);
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});

// Handle errors
server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
