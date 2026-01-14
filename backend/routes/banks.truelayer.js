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

    // Redirect to frontend with success
    return res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankConnected=1`);
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
