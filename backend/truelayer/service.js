/**
 * TrueLayer Service
 * Higher-level business logic for bank connections and sync
 */

const crypto = require('crypto');
const client = require('./client');

// In-memory state store with TTL (5 minutes)
// In production, use Redis or DB-backed store
const stateStore = new Map();
const STATE_TTL_MS = 5 * 60 * 1000;

/**
 * Generate and store a CSRF-safe state token for OAuth
 * @param {string} userId - Current user ID
 * @returns {string} State token
 */
function createState(userId) {
  const state = crypto.randomBytes(32).toString('hex');
  stateStore.set(state, {
    userId,
    createdAt: Date.now(),
  });
  
  // Clean up expired states periodically
  cleanExpiredStates();
  
  return state;
}

/**
 * Validate and consume a state token
 * @param {string} state - State token from callback
 * @returns {string|null} User ID if valid, null otherwise
 */
function validateState(state) {
  const entry = stateStore.get(state);
  if (!entry) return null;
  
  stateStore.delete(state); // Consume (one-time use)
  
  // Check TTL
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    return null;
  }
  
  return entry.userId;
}

function cleanExpiredStates() {
  const now = Date.now();
  for (const [state, entry] of stateStore.entries()) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      stateStore.delete(state);
    }
  }
}

/**
 * Store or update bank connection tokens
 * @param {Object} prisma - Prisma client
 * @param {string} userId - User ID
 * @param {Object} tokenResponse - Token response from TrueLayer
 */
async function storeConnection(prisma, userId, tokenResponse) {
  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000)
    : null;

  // Encrypt refresh token if present
  let encrypted = null;
  if (tokenResponse.refresh_token) {
    encrypted = encryptToken(tokenResponse.refresh_token);
  }

  await prisma.bankConnection.upsert({
    where: {
      user_id_provider: {
        user_id: userId,
        provider: 'truelayer',
      },
    },
    update: {
      access_token: tokenResponse.access_token,
      encrypted_refresh_token: encrypted ? encrypted.ciphertext : null,
      refresh_token_iv: encrypted ? encrypted.iv : null,
      refresh_token_tag: encrypted ? encrypted.tag : null,
      token_expires_at: expiresAt,
    },
    create: {
      user_id: userId,
      provider: 'truelayer',
      access_token: tokenResponse.access_token,
      encrypted_refresh_token: encrypted ? encrypted.ciphertext : null,
      refresh_token_iv: encrypted ? encrypted.iv : null,
      refresh_token_tag: encrypted ? encrypted.tag : null,
      token_expires_at: expiresAt,
    },
  });
}

/**
 * Get valid access token, refreshing if needed
 * @param {Object} prisma - Prisma client
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Valid access token or null
 */
async function getValidAccessToken(prisma, userId) {
  const connection = await prisma.bankConnection.findUnique({
    where: {
      user_id_provider: {
        user_id: userId,
        provider: 'truelayer',
      },
    },
  });

  if (!connection) return null;

  // Check if token expires within 5 minutes
  const buffer = 5 * 60 * 1000;
  const needsRefresh = connection.token_expires_at && 
    new Date(connection.token_expires_at).getTime() - Date.now() < buffer;

  // Decrypt refresh token if present
  let refreshToken = null;
  if (connection.encrypted_refresh_token && connection.refresh_token_iv && connection.refresh_token_tag) {
    refreshToken = decryptToken({
      ciphertext: connection.encrypted_refresh_token,
      iv: connection.refresh_token_iv,
      tag: connection.refresh_token_tag,
    });
  }

  if (needsRefresh && refreshToken) {
    try {
      const newTokens = await client.refreshToken({
        refresh_token: refreshToken,
      });
      await storeConnection(prisma, userId, newTokens);
      return newTokens.access_token;
    } catch (err) {
      console.error('Failed to refresh token:', err.message);
      // Token refresh failed - connection may need re-auth
      return null;
    }
  }

  return connection.access_token;
}
// AES-256-GCM encryption helpers
function getEncryptionKey() {
  const keyB64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyB64) throw new Error('TOKEN_ENCRYPTION_KEY not set');
  const buf = Buffer.from(keyB64, 'base64');
  if (buf.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
  return buf;
}

function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96 bits for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptToken({ ciphertext, iv, tag }) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Check if user has a bank connection
 * @param {Object} prisma - Prisma client
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Connection status
 */
async function getConnectionStatus(prisma, userId) {
  const connection = await prisma.bankConnection.findUnique({
    where: {
      user_id_provider: {
        user_id: userId,
        provider: 'truelayer',
      },
    },
    select: {
      created_at: true,
      token_expires_at: true,
    },
  });

  if (!connection) return null;

  return {
    connected: true,
    provider: 'truelayer',
    connectedAt: connection.created_at,
    tokenExpiresAt: connection.token_expires_at,
  };
}

/**
 * Sync accounts and transactions from TrueLayer to local DB
 * @param {Object} prisma - Prisma client
 * @param {string} userId - User ID
 * @param {Object} options
 * @param {string} [options.fromDate] - Start date YYYY-MM-DD
 * @param {string} [options.toDate] - End date YYYY-MM-DD
 * @returns {Promise<Object>} Sync summary
 */
async function syncAccountsAndTransactions(prisma, userId, { fromDate, toDate } = {}) {
  const accessToken = await getValidAccessToken(prisma, userId);
  if (!accessToken) {
    const error = new Error('No valid bank connection. Please reconnect your bank.');
    error.code = 'TOKEN_EXPIRED';
    throw error;
  }

  // Default date range: last 2 years (to get full transaction history)
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setFullYear(defaultFrom.getFullYear() - 2); // 2 years back
  
  const from = fromDate || defaultFrom.toISOString().slice(0, 10);
  const to = toDate || now.toISOString().slice(0, 10);

  console.log(`[TrueLayer] Syncing transactions from ${from} to ${to}`);

  // Fetch accounts
  let accounts;
  try {
    accounts = await client.getAccounts({ access_token: accessToken });
  } catch (err) {
    if (err.message.includes('Access token expired or invalid')) {
      // Mark connection as invalid by deleting it
      await prisma.bankConnection.deleteMany({
        where: { user_id: userId, provider: 'truelayer' },
      });
      const error = new Error('Access token expired. Please reconnect your bank.');
      error.code = 'TOKEN_EXPIRED';
      throw error;
    }
    throw err;
  }
  
  // Upsert accounts and fetch balances
  for (const acc of accounts) {
    let balance = null;
    try {
      balance = await client.getBalance({ access_token: accessToken, account_id: acc.account_id });
      console.log(`[TrueLayer] Account ${acc.display_name || acc.account_id} balance: ${balance.current} ${balance.currency}`);
    } catch (err) {
      console.error(`Failed to fetch balance for account ${acc.account_id}:`, err.message);
    }
    
    await prisma.bankAccount.upsert({
      where: {
        user_id_provider_provider_account_id: {
          user_id: userId,
          provider: 'truelayer',
          provider_account_id: acc.account_id,
        },
      },
      update: {
        account_name: acc.display_name || acc.account_number?.number || null,
        currency: acc.currency || balance?.currency || null,
        balance: balance?.current || null,
        available_balance: balance?.available || null,
      },
      create: {
        user_id: userId,
        provider: 'truelayer',
        provider_account_id: acc.account_id,
        account_name: acc.display_name || acc.account_number?.number || null,
        currency: acc.currency || balance?.currency || null,
        balance: balance?.current || null,
        available_balance: balance?.available || null,
      },
    });
  }

  let totalInserted = 0;
  let totalSkipped = 0;

  // Fetch and sync transactions for each account
  for (const acc of accounts) {
    try {
      const transactions = await client.getTransactions({
        access_token: accessToken,
        account_id: acc.account_id,
        from,
        to,
      });

      console.log(`[TrueLayer] Processing ${transactions.length} transactions for account ${acc.display_name || acc.account_id}`);

      for (const tx of transactions) {
        const normalized = normalizeTransaction(tx, userId);
        
        // Check if transaction already exists
        const existing = await prisma.transaction.findUnique({
          where: { id: normalized.id },
        });
        
        if (existing) {
          totalSkipped++;
        } else {
          try {
            await prisma.transaction.create({
              data: normalized,
            });
            totalInserted++;
          } catch (err) {
            // Ignore duplicate key errors (race condition)
            if (err.code === 'P2002') {
              totalSkipped++;
            } else {
              throw err;
            }
          }
        }
      }
    } catch (err) {
      // Log but don't fail the whole sync if one account has issues
      if (err.message.includes('403')) {
        console.log(`[TrueLayer] Skipping transactions for ${acc.display_name || acc.account_id}: Bank may not support transaction access`);
      } else {
        console.error(`Failed to sync account ${acc.account_id}:`, err.message);
      }
    }
  }

  console.log(`[TrueLayer] Sync complete: ${totalInserted} new, ${totalSkipped} existing`);

  return {
    accounts: accounts.length,
    inserted: totalInserted,
    skipped: totalSkipped,
    dateRange: { from, to },
  };
}

/**
 * Normalize TrueLayer transaction to our Transaction table format
 */
function normalizeTransaction(tx, userId) {
  // TrueLayer transaction IDs are stable
  const id = `tl_${tx.transaction_id}`;
  
  // Determine type based on amount sign
  // TrueLayer: negative = money out, positive = money in
  const rawAmount = parseFloat(tx.amount) || 0;
  const type = rawAmount < 0 ? 'expense' : 'income';
  const amount = Math.abs(rawAmount);
  
  // Date as Date object for Prisma DateTime
  const date = tx.timestamp
    ? new Date(tx.timestamp)
    : new Date();
  
  // Description from merchant or transaction description
  const description = tx.merchant_name || tx.description || '';
  
  // Category: TrueLayer provides transaction_category
  // Map to "Other" for now (could map to our categories later)
  const category = tx.transaction_category || 'Other';

  return {
    id,
    user_id: userId,
    type,
    amount,
    date,
    category,
    description,
  };
}

/**
 * Remove bank connection for user
 * @param {Object} prisma - Prisma client
 * @param {string} userId - User ID
 */
async function disconnectBank(prisma, userId) {
  await prisma.bankConnection.deleteMany({
    where: { user_id: userId, provider: 'truelayer' },
  });
  
  // Optionally clean up accounts (but keep transactions)
  await prisma.bankAccount.deleteMany({
    where: { user_id: userId, provider: 'truelayer' },
  });
}

module.exports = {
  createState,
  validateState,
  storeConnection,
  getValidAccessToken,
  getConnectionStatus,
  syncAccountsAndTransactions,
  disconnectBank,
};
