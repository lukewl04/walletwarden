/**
 * TrueLayer Bank Connection Routes
 * Handles OAuth flow and transaction sync
 */

const express = require('express');
const router = express.Router();

const config = require('../truelayer/config');
const client = require('../truelayer/client');
const service = require('../truelayer/service');

// Prisma client will be attached by the main app
let prisma = null;

/**
 * Middleware to check TrueLayer is configured
 */
function requireConfig(req, res, next) {
  if (!config.validateConfig()) {
    return res.status(503).json({
      error: 'truelayer_not_configured',
      message: 'TrueLayer integration is not configured. Set TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET.',
    });
  }
  next();
}

/**
 * GET /api/banks/truelayer/connect
 * Returns the TrueLayer authorization URL for the user to connect their bank
 */
router.get('/connect', requireConfig, (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Create CSRF state
    const state = service.createState(userId);
    
    // Build auth URL
    const url = client.buildAuthUrl({ state });
    
    return res.json({ url });
  } catch (err) {
    console.error('Error generating connect URL:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

/**
 * GET /api/banks/truelayer/callback
 * OAuth callback - exchanges code for tokens and redirects to frontend
 */
router.get('/callback', requireConfig, async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('TrueLayer OAuth error:', error, error_description);
      return res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankError=${encodeURIComponent(error)}`);
    }

    // Validate state and get userId
    if (!state) {
      return res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankError=missing_state`);
    }

    const userId = service.validateState(state);
    if (!userId) {
      return res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankError=invalid_state`);
    }

    if (!code) {
      return res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankError=missing_code`);
    }

    // Exchange code for tokens
    const tokenResponse = await client.exchangeCodeForToken({ code });

    // Store connection
    await service.storeConnection(prisma, userId, tokenResponse);

    // IMPORTANT: Sync transactions immediately!
    // UK Open Banking SCA rules only allow transaction access within 5 minutes of authentication
    console.log('[TrueLayer] Syncing transactions immediately after connection (SCA window)...');
    try {
      const syncResult = await service.syncAccountsAndTransactions(prisma, userId, {});
      console.log(`[TrueLayer] Initial sync complete: ${syncResult.inserted} transactions`);
      // Redirect with sync count
      return res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankConnected=1&synced=${syncResult.inserted}`);
    } catch (syncErr) {
      console.error('[TrueLayer] Initial sync failed:', syncErr.message);
      // Still redirect as connected, but note the sync issue
      return res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankConnected=1&syncError=1`);
    }
  } catch (err) {
    console.error('Error in TrueLayer callback:', err);
    return res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankError=token_exchange_failed`);
  }
});

/**
 * POST /api/banks/truelayer/sync
 * Sync transactions from connected bank
 * Body: { fromDate?: string, toDate?: string }
 */
router.post('/sync', requireConfig, async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { fromDate, toDate } = req.body || {};

    const result = await service.syncAccountsAndTransactions(prisma, userId, {
      fromDate,
      toDate,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error('Error syncing transactions:', err);
    
    if (err.code === 'TOKEN_EXPIRED' || err.message.includes('No valid bank connection')) {
      return res.status(401).json({ error: 'token_expired', message: err.message, requiresReconnect: true });
    }
    
    return res.status(500).json({ error: 'sync_failed', message: err.message });
  }
});

/**
 * GET /api/banks/truelayer/status
 * Check if user has a connected bank
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const status = await service.getConnectionStatus(prisma, userId);
    
    return res.json({
      connected: !!status,
      ...status,
    });
  } catch (err) {
    console.error('Error checking status:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

/**
 * GET /api/banks/truelayer/balance
 * Get the actual bank balance from connected accounts
 */
router.get('/balance', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Get all bank accounts for user
    const accounts = await prisma.bankAccount.findMany({
      where: { user_id: userId, provider: 'truelayer' },
      select: {
        account_name: true,
        balance: true,
        available_balance: true,
        currency: true,
        provider_account_id: true,
      },
    });

    if (accounts.length === 0) {
      return res.json({ totalBalance: null, accounts: [] });
    }

    // Find the main account (for Monzo, it's the first one / the one with the user's name)
    // Pots typically have descriptive names like "Savings", "Holiday", etc.
    // The main account is usually the first account returned or has a personal name
    const mainAccount = accounts[0]; // TrueLayer returns main account first
    
    // Sum up all account balances for reference
    const totalAllAccounts = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

    console.log(`[Balance API] User ${userId}: Main account £${(mainAccount.balance || 0).toFixed(2)}, Total (all pots) £${totalAllAccounts.toFixed(2)}`);

    return res.json({
      totalBalance: mainAccount.balance || 0,
      availableBalance: mainAccount.available_balance || 0,
      currency: accounts[0]?.currency || 'GBP',
      accounts: accounts.map(a => ({
        name: a.account_name,
        balance: a.balance,
        available: a.available_balance,
        currency: a.currency,
      })),
    });
  } catch (err) {
    console.error('Error fetching balance:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

/**
 * DELETE /api/banks/truelayer/disconnect
 * Remove bank connection
 */
router.delete('/disconnect', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    await service.disconnectBank(prisma, userId);
    
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error disconnecting bank:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

/**
 * Initialize router with Prisma client
 * @param {Object} prismaClient - Prisma client instance
 */
function init(prismaClient) {
  prisma = prismaClient;
  return router;
}

module.exports = init;
