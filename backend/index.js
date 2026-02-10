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
  ssl: { rejectUnauthorized: false }, // Required for Supabase
  // Connection pool optimizations - reduced for Supabase Session mode limit
  max: 5, // Maximum connections (Supabase Session mode default is 10 total)
  min: 1,  // Minimum connections to keep alive
  idleTimeoutMillis: 20000, // Close idle connections after 20s
  connectionTimeoutMillis: 8000, // Timeout waiting for connection
});

// Initialize Prisma with PostgreSQL adapter
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

console.log('[Prisma] Initialized Prisma client with PostgreSQL adapter');
console.log('[Prisma] Database URL:', connectionString.split('@')[1] || 'configured');

// Simple in-memory cache for frequently accessed data
const cache = new Map();
const CACHE_TTL = 5000; // 5 seconds

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, { data, expires: Date.now() + ttl });
}

function invalidateCache(keyPrefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) cache.delete(key);
  }
}

// Allow both dev ports for CORS
const corsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_ORIGIN
].filter(Boolean);

app.use(cors({ origin: corsOrigins }));

// Stripe webhook needs raw body for signature verification
// Must be mounted BEFORE express.json() so the body isn't consumed.
// Local testing: stripe listen --forward-to localhost:4000/api/stripe/webhook
const stripeWebhookHandler = require('./routes/stripe-webhook')(prisma);
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '10mb' }));

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

// Auth middleware: extract user_id from Authorization header
// In production, this would validate JWT. In dev, the token IS the user_id.
app.use((req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const email = req.headers['x-user-email'] || null; // Email from frontend
  req.auth = { sub: token || 'dev-user', email };
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
console.log('[TrueLayer] trueLayerRoutes type:', typeof trueLayerRoutes);
const trueLayerRouter = trueLayerRoutes(prisma);
console.log('[TrueLayer] Router created:', !!trueLayerRouter);
app.use('/api/banks/truelayer', trueLayerRouter);

// Subscription & entitlements routes
const { attachEntitlements } = require('./entitlements');
app.use(attachEntitlements(prisma));   // populates req.entitlements for all routes below

const subscriptionRoutes = require('./routes/subscription');
app.use('/api', subscriptionRoutes(prisma));

const gatedFeatureRoutes = require('./routes/gated-features');
app.use('/api', gatedFeatureRoutes(prisma));

const billingRoutes = require('./routes/billing');
app.use('/api/billing', billingRoutes(prisma));

// Admin routes (protected by admin middleware)
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes(prisma));

// Attach user role to all requests (for frontend to check)
const { attachRole } = require('./admin');
app.use(attachRole(prisma));

// health
app.get('/health', (req, res) => res.json({ ok: true, database: 'supabase' }));

// Get current user's role (for frontend visibility checks)
app.get('/api/me/role', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const role = req.userRole || 'user';
    return res.json({ role });
  } catch (err) {
    console.error('[Auth] Error getting user role:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

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
        description: true,
        source: true
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
            description: it.description || null,
            source: 'manual' // Mark as manually uploaded
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
        description: description || null,
        source: 'manual' // Mark as manually created
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

    // Check cache first
    const cacheKey = `splits:${userId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

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
    
    // Cache the result
    setCache(cacheKey, parsed);
    
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
    
    // Invalidate cache
    invalidateCache(`splits:${userId}`);
    
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

    // Check cache first
    const cacheKey = `purchases:${userId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Use raw SQL for maximum performance
    const rows = await prisma.$queryRaw`
      SELECT id, split_id, transaction_id, date, amount, category, description
      FROM purchases
      WHERE user_id = ${userId}
      ORDER BY date DESC
    `;
    
    // Convert date fields to ISO string for frontend compatibility
    const result = rows.map(r => ({ 
      ...r, 
      date: r.date ? new Date(r.date).toISOString() : null,
      amount: Number(r.amount) // Ensure number type
    }));
    
    // Cache the result
    setCache(cacheKey, result);
    
    return res.json(result);
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
    
    // Invalidate cache
    invalidateCache(`purchases:${userId}`);
    
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Batch upsert purchases (much more efficient than individual calls)
app.post('/api/purchases/batch', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { purchases } = req.body;
    if (!Array.isArray(purchases) || purchases.length === 0) {
      return res.status(400).json({ error: 'invalid_payload', message: 'purchases array required' });
    }

    // Process individually (Supabase pgbouncer doesn't support long transactions)
    let processed = 0;
    let errors = 0;
    for (const p of purchases) {
      try {
        await prisma.purchase.upsert({
          where: { id: p.id },
          update: {
            split_id: p.split_id,
            transaction_id: p.transaction_id || null,
            date: p.date ? new Date(p.date) : undefined,
            amount: p.amount,
            category: p.category,
            description: p.description || null
          },
          create: {
            id: p.id,
            user_id: userId,
            split_id: p.split_id,
            transaction_id: p.transaction_id || null,
            date: p.date ? new Date(p.date) : undefined,
            amount: p.amount,
            category: p.category,
            description: p.description || null
          }
        });
        processed++;
      } catch (e) {
        errors++;
        if (errors <= 3) console.error(`[Batch] Upsert error for ${p.id}:`, e.message);
      }
    }
    
    // Invalidate cache
    invalidateCache(`purchases:${userId}`);
    
    return res.json({ ok: true, count: purchases.length });
  } catch (err) {
    console.error('Batch purchase error:', err);
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

// Deduplicate purchases by transaction_id (keeps the oldest entry)
app.post('/api/purchases/deduplicate', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    // Find all purchases with duplicate transaction_ids
    const duplicates = await prisma.$queryRaw`
      WITH duplicates AS (
        SELECT transaction_id, MIN(created_at) as keep_date, COUNT(*) as cnt
        FROM purchases
        WHERE user_id = ${userId} AND transaction_id IS NOT NULL
        GROUP BY transaction_id
        HAVING COUNT(*) > 1
      )
      SELECT p.id, p.transaction_id, p.created_at
      FROM purchases p
      INNER JOIN duplicates d ON p.transaction_id = d.transaction_id
      WHERE p.user_id = ${userId} AND p.created_at > d.keep_date
    `;

    if (duplicates.length === 0) {
      return res.json({ ok: true, deleted: 0, message: 'No duplicates found' });
    }

    const idsToDelete = duplicates.map(d => d.id);
    console.log(`[Dedup] Found ${idsToDelete.length} duplicate purchases to delete for user ${userId}`);

    // Delete in batches to avoid query parameter limit (max ~32k params)
    const BATCH_SIZE = 5000;
    let totalDeleted = 0;
    
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE);
      console.log(`[Dedup] Deleting batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(idsToDelete.length / BATCH_SIZE)} (${batch.length} items)`);
      
      const result = await prisma.purchase.deleteMany({
        where: {
          id: { in: batch },
          user_id: userId
        }
      });
      totalDeleted += result.count;
    }

    // Invalidate cache
    invalidateCache(`purchases:${userId}`);

    console.log(`[Dedup] Deleted ${totalDeleted} duplicate purchases for user ${userId}`);
    return res.json({ ok: true, deleted: totalDeleted });
  } catch (err) {
    console.error('Error deduplicating purchases:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Income Settings endpoints
app.get('/api/income-settings', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    // Check cache first
    const cacheKey = `income:${userId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

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
    
    // Cache the result
    setCache(cacheKey, rows);
    
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
    
    // Invalidate cache
    invalidateCache(`income:${userId}`);
    
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
    
    // Invalidate cache
    invalidateCache(`income:${userId}`);
    
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Reset everything for the current user (transactions, splits, purchases, bank connections)
app.post('/api/reset', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    console.log(`[Reset] Starting full data reset for user: ${userId}`);

    // Delete in correct order to avoid FK issues
    // 1. First delete purchases (depends on splits)
    const purchaseResult = await prisma.purchase.deleteMany({ where: { user_id: userId } });
    console.log(`[Reset] Deleted ${purchaseResult.count} purchases`);

    // 2. Delete income settings (depends on splits)
    const incomeSettingsResult = await prisma.incomeSetting.deleteMany({ where: { user_id: userId } });
    console.log(`[Reset] Deleted ${incomeSettingsResult.count} income settings`);

    // 3. Delete splits
    const splitResult = await prisma.split.deleteMany({ where: { user_id: userId } });
    console.log(`[Reset] Deleted ${splitResult.count} splits`);

    // 4. Delete all transactions (manual + bank)
    const txResult = await prisma.transaction.deleteMany({ where: { user_id: userId } });
    console.log(`[Reset] Deleted ${txResult.count} transactions`);

    // 5. Delete bank balance snapshots (all providers)
    const balanceSnapshotResult = await prisma.bankBalanceSnapshot.deleteMany({ 
      where: { user_id: userId } 
    });
    console.log(`[Reset] Deleted ${balanceSnapshotResult.count} balance snapshots`);

    // 6. Delete bank accounts (all providers)
    const bankAccountResult = await prisma.bankAccount.deleteMany({ 
      where: { user_id: userId } 
    });
    console.log(`[Reset] Deleted ${bankAccountResult.count} bank accounts`);

    // 7. Delete bank connections (all providers, removes TrueLayer tokens)
    const bankConnectionResult = await prisma.bankConnection.deleteMany({ 
      where: { user_id: userId } 
    });
    console.log(`[Reset] Deleted ${bankConnectionResult.count} bank connections`);

    console.log(`[Reset] Full data reset complete for user: ${userId}`);

    return res.json({
      ok: true,
      cleared: {
        transactions: txResult.count,
        purchases: purchaseResult.count,
        splits: splitResult.count,
        incomeSettings: incomeSettingsResult.count,
        bankConnections: bankConnectionResult.count,
        bankAccounts: bankAccountResult.count,
        balanceSnapshots: balanceSnapshotResult.count,
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
