require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const app = express();

// Set up PostgreSQL connection pool for Supabase
// Uses DATABASE_URL which should be the pooled connection (transaction mode)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  console.error('Please set DATABASE_URL to your Supabase PostgreSQL connection string');
  console.error('Find it in: Supabase Dashboard > Settings > Database > Connection string');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false } // Required for Supabase
});

// Initialize Prisma with PostgreSQL adapter
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

console.log('[Prisma] Initialized Prisma client with PostgreSQL adapter');
console.log('[Prisma] Database URL:', connectionString.split('@')[1] || 'configured');

// Allow both dev ports for CORS
const corsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_ORIGIN
].filter(Boolean);

app.use(cors({ origin: corsOrigins }));
app.use(express.json());

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
  req.auth = { sub: token || 'dev-user' };
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

// TrueLayer Open Banking routes
const trueLayerRoutes = require('./routes/banks.truelayer');
console.log('[TrueLayer] Setting up routes, prisma available:', !!prisma);
app.use('/api/banks/truelayer', trueLayerRoutes(prisma));

// health
app.get('/health', (req, res) => res.json({ ok: true, database: 'supabase' }));

// Get transactions for authenticated user
app.get('/api/transactions', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const rows = await prisma.transaction.findMany({
      where: { user_id: userId },
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        category: true,
        description: true
      }
    });
    // Convert date fields to ISO string for frontend compatibility
    return res.json(rows.map(r => ({ ...r, date: r.date ? new Date(r.date).toISOString() : null })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Bulk insert
app.post('/api/transactions/bulk', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const items = Array.isArray(req.body) ? req.body : (req.body?.transactions || []);
    if (!items.length) return res.status(400).json({ error: 'no_transactions' });

    // Use upsert for each transaction to handle duplicates
    const results = await Promise.all(
      items.map(it => 
        prisma.transaction.upsert({
          where: { id: it.id },
          update: {}, // Don't update if exists
          create: {
            id: it.id,
            user_id: userId,
            type: it.type,
            amount: it.amount,
            date: it.date ? new Date(it.date) : undefined,
            category: it.category || null,
            description: it.description || null
          }
        }).catch(e => {
          // Ignore duplicate key errors
          if (e.code === 'P2002') return null;
          throw e;
        })
      )
    );

    const inserted = results.filter(r => r !== null).length;
    return res.json({ ok: true, inserted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Single create
app.post('/api/transactions', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id, type, amount, date, category, description } = req.body;
    if (!id || !type || !amount || !date) return res.status(400).json({ error: 'invalid_payload' });

    await prisma.transaction.upsert({
      where: { id },
      update: {},
      create: {
        id,
        user_id: userId,
        type,
        amount,
        date: date ? new Date(date) : undefined,
        category: category || null,
        description: description || null
      }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Update transaction
app.patch('/api/transactions/:id', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    
    const id = req.params.id;
    const { type, amount, date, category, description } = req.body;
    
    const updateData = {};
    if (type !== undefined) updateData.type = type;
    if (amount !== undefined) updateData.amount = amount;
    if (date !== undefined) updateData.date = date ? new Date(date) : undefined;
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    
    await prisma.transaction.updateMany({
      where: { id, user_id: userId },
      data: updateData
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Bulk delete all transactions for user - MUST come before :id route
app.delete('/api/transactions/clear', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    
    const result = await prisma.transaction.deleteMany({
      where: { user_id: userId }
    });
    
    console.log(`Cleared ${result.count} transactions for user ${userId}`);
    return res.json({ ok: true, deleted: result.count });
  } catch (err) {
    console.error('Error clearing transactions:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// delete single transaction
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    
    const id = req.params.id;
    await prisma.transaction.deleteMany({
      where: { id, user_id: userId }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Splits endpoints
app.get('/api/splits', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const rows = await prisma.split.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        frequency: true,
        categories: true,
        created_at: true
      }
    });
    // Parse JSON categories
    const parsed = rows.map(r => ({ ...r, categories: JSON.parse(r.categories) }));
    return res.json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
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

    await prisma.split.upsert({
      where: { id },
      update: {
        name,
        frequency,
        categories: JSON.stringify(categories),
        updated_at: new Date()
      },
      create: {
        id,
        user_id: userId,
        name,
        frequency,
        categories: JSON.stringify(categories)
      }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

app.delete('/api/splits/:id', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    
    const id = req.params.id;
    await prisma.split.deleteMany({
      where: { id, user_id: userId }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Purchases endpoints
app.get('/api/purchases', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const rows = await prisma.purchase.findMany({
      where: { user_id: userId },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        split_id: true,
        transaction_id: true,
        date: true,
        amount: true,
        category: true,
        description: true
      }
    });
    // Convert date fields to ISO string for frontend compatibility
    return res.json(rows.map(r => ({ ...r, date: r.date ? new Date(r.date).toISOString() : null })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

app.post('/api/purchases', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id, split_id, transaction_id, date, amount, category, description } = req.body;
    if (!id || !split_id || !date || !amount || !category) {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    await prisma.purchase.upsert({
      where: { id },
      update: {
        split_id,
        transaction_id: transaction_id || null,
        date: date ? new Date(date) : undefined,
        amount,
        category,
        description: description || null
      },
      create: {
        id,
        user_id: userId,
        split_id,
        transaction_id: transaction_id || null,
        date: date ? new Date(date) : undefined,
        amount,
        category,
        description: description || null
      }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

app.delete('/api/purchases/:id', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    
    const id = req.params.id;
    await prisma.purchase.deleteMany({
      where: { id, user_id: userId }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Income Settings endpoints
app.get('/api/income-settings', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const rows = await prisma.incomeSetting.findMany({
      where: { user_id: userId },
      select: {
        id: true,
        split_id: true,
        expected_amount: true,
        frequency: true,
        next_payday: true,
        use_expected_when_no_actual: true,
        created_at: true,
        updated_at: true
      }
    });
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

app.post('/api/income-settings', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id, split_id, expected_amount, frequency, next_payday, use_expected_when_no_actual } = req.body;
    if (!split_id) {
      return res.status(400).json({ error: 'invalid_payload', message: 'split_id is required' });
    }

    const settingId = id || `income-setting-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const useExpected = use_expected_when_no_actual !== false;

    const saved = await prisma.incomeSetting.upsert({
      where: { split_id },
      update: {
        expected_amount: Math.abs(Number(expected_amount) || 0),
        frequency: frequency || 'monthly',
        next_payday: next_payday || null,
        use_expected_when_no_actual: useExpected,
        updated_at: new Date()
      },
      create: {
        id: settingId,
        user_id: userId,
        split_id,
        expected_amount: Math.abs(Number(expected_amount) || 0),
        frequency: frequency || 'monthly',
        next_payday: next_payday || null,
        use_expected_when_no_actual: useExpected
      }
    });
    
    return res.json(saved);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

app.delete('/api/income-settings/:id', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    
    const id = req.params.id;
    await prisma.incomeSetting.deleteMany({
      where: { id, user_id: userId }
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Reset everything for the current user (transactions, splits, purchases)
app.post('/api/reset', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const [txResult, purchaseResult, splitResult, incomeSettingsResult] = await Promise.all([
      prisma.transaction.deleteMany({ where: { user_id: userId } }),
      prisma.purchase.deleteMany({ where: { user_id: userId } }),
      prisma.split.deleteMany({ where: { user_id: userId } }),
      prisma.incomeSetting.deleteMany({ where: { user_id: userId } })
    ]);

    return res.json({
      ok: true,
      cleared: {
        transactions: txResult.count,
        purchases: purchaseResult.count,
        splits: splitResult.count,
        incomeSettings: incomeSettingsResult.count,
      },
    });
  } catch (err) {
    console.error('Error resetting user data:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Test database connection on startup
async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to Supabase PostgreSQL database');
    return true;
  } catch (err) {
    console.error('❌ Failed to connect to database:', err.message);
    return false;
  }
}

// start
const port = process.env.PORT || 4000;

testConnection().then(connected => {
  if (!connected) {
    console.error('Database connection failed. Please check your DATABASE_URL.');
    process.exit(1);
  }
  
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Backend running on http://localhost:${port} (Supabase PostgreSQL)`);
    console.log(`Server is listening and ready for connections...`);
  });

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await prisma.$disconnect();
    server.close(() => {
      process.exit(0);
    });
  });

  // Handle errors
  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
});
