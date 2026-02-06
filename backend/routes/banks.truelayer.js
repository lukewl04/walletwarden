/**
 * TrueLayer Bank Connection Routes
 * Handles OAuth flow and transaction sync
 */

const express = require("express");
const router = express.Router();

const config = require("../truelayer/config");
const client = require("../truelayer/client");
const service = require("../truelayer/service");

// Prisma client will be attached by the main app
let prisma = null;

/**
 * Middleware to check TrueLayer is configured
 */
function requireConfig(req, res, next) {
  if (!config.validateConfig()) {
    return res.status(503).json({
      error: "truelayer_not_configured",
      message:
        "TrueLayer integration is not configured. Set TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET.",
    });
  }
  next();
}

/**
 * GET /api/banks/truelayer/connect
 * Returns the TrueLayer authorization URL for the user to connect their bank
 */
router.get("/connect", requireConfig, (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Create CSRF state
    const state = service.createState(userId);

    // Build auth URL
    const url = client.buildAuthUrl({ state });

    return res.json({ url });
  } catch (err) {
    console.error("Error generating connect URL:", err);
    return res
      .status(500)
      .json({ error: "internal_error", message: err.message });
  }
});

/**
 * GET /api/banks/truelayer/callback
 * OAuth callback - exchanges code for tokens and redirects to frontend
 *
 * Flow:
 * 1) Exchange code -> tokens
 * 2) Store tokens
 * 3) Redirect user back to frontend IMMEDIATELY
 * 4) Quick sync + full sync run entirely in background
 * 5) Frontend polls /balance + /transactions in real-time
 */
router.get("/callback", requireConfig, async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Check if prisma is available
    if (!prisma) {
      console.error('[TrueLayer] ERROR: prisma is not initialized in callback endpoint');
      return res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankError=database_unavailable`);
    }

    // Handle OAuth errors
    if (error) {
      console.error("TrueLayer OAuth error:", error, error_description);
      return res.redirect(
        `${config.FRONTEND_URL}/wardeninsights?bankError=${encodeURIComponent(error)}`
      );
    }

    if (!state) {
      return res.redirect(
        `${config.FRONTEND_URL}/wardeninsights?bankError=missing_state`
      );
    }

    const userId = service.validateState(state);
    if (!userId) {
      return res.redirect(
        `${config.FRONTEND_URL}/wardeninsights?bankError=invalid_state`
      );
    }

    if (!code) {
      return res.redirect(
        `${config.FRONTEND_URL}/wardeninsights?bankError=missing_code`
      );
    }

    // Exchange code for tokens
    const tokenResponse = await client.exchangeCodeForToken({ code });

    // Store connection tokens (encrypted refresh token etc.)
    await service.storeConnection(prisma, userId, tokenResponse);

    // Redirect IMMEDIATELY — syncs run in the background;
    // the frontend polls for results in real-time.
    res.redirect(`${config.FRONTEND_URL}/wardeninsights?bankConnected=1&syncing=1`);

    // Background: quick sync (balance + recent txns) then full history
    (async () => {
      try {
        console.log("[TrueLayer] Background quick sync starting...");
        await service.quickSyncLatest(prisma, userId, { limit: 30, daysBack: 60 });
        console.log("[TrueLayer] Background quick sync complete.");
      } catch (e) {
        console.error("[TrueLayer] Background quick sync failed:", e);
      }
      try {
        console.log("[TrueLayer] Background full sync starting...");
        const syncResult = await service.syncAccountsAndTransactions(prisma, userId, {});
        console.log(
          `[TrueLayer] Background full sync complete: ${syncResult.inserted} transactions`
        );
      } catch (e) {
        console.error("[TrueLayer] Background full sync failed:", e);
      }
    })();

    return;
  } catch (err) {
    console.error("Error in TrueLayer callback:", err);
    return res.redirect(
      `${config.FRONTEND_URL}/wardeninsights?bankError=token_exchange_failed`
    );
  }
});


/**
 * POST /api/banks/truelayer/sync
 * Sync transactions from connected bank
 * Body: { fromDate?: string, toDate?: string }
 *
 * Optional query:
 *  - ?mode=quick  -> quick sync balances + latest 30
 *  - ?limit=30    -> limit for quick mode
 */
router.post("/sync", requireConfig, async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (!prisma) {
      console.error('[TrueLayer] ERROR: prisma is not initialized in sync endpoint');
      return res.status(503).json({ error: "database_unavailable", message: "Database client not available" });
    }

    const mode = String(req.query.mode || "full").toLowerCase();

    if (mode === "quick") {
      const limit = Number(req.query.limit || 30);
      const result = await service.quickSyncLatest(prisma, userId, {
        limit,
        daysBack: 60,
      });

      return res.json({
        ok: true,
        mode: "quick",
        ...result,
      });
    }

    const { fromDate, toDate } = req.body || {};

    const result = await service.syncAccountsAndTransactions(prisma, userId, {
      fromDate,
      toDate,
    });

    return res.json({
      ok: true,
      mode: "full",
      ...result,
    });
  } catch (err) {
    console.error("Error syncing transactions:", err);

    if (
      err.code === "TOKEN_EXPIRED" ||
      (err.message || "").includes("No valid bank connection")
    ) {
      return res.status(401).json({
        error: "token_expired",
        message: err.message,
        requiresReconnect: true,
      });
    }

    return res.status(500).json({ error: "sync_failed", message: err.message });
  }
});

/**
 * GET /api/banks/truelayer/status
 * Check if user has a connected bank
 */
router.get("/status", async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (!prisma) {
      console.error('[TrueLayer] ERROR: prisma is not initialized in status endpoint');
      return res.status(503).json({ error: "database_unavailable", message: "Database client not available" });
    }

    const status = await service.getConnectionStatus(prisma, userId);

    return res.json({
      connected: !!status,
      ...status,
    });
  } catch (err) {
    console.error("Error checking status:", err);
    return res
      .status(500)
      .json({ error: "internal_error", message: err.message });
  }
});

/**
 * GET /api/banks/truelayer/balance
 * Get the actual bank balance - fetches LIVE from TrueLayer if connected, otherwise from DB
 */
router.get("/balance", async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Check if prisma is available
    if (!prisma) {
      console.error('[TrueLayer] ERROR: prisma is not initialized in balance endpoint');
      return res.status(503).json({ error: "database_unavailable", message: "Database client not available" });
    }

    // Try to get live balance from TrueLayer
    const accessToken = await service.getValidAccessToken(prisma, userId);
    
    if (accessToken) {
      try {
        // Fetch accounts from TrueLayer
        const accounts = await client.getAccounts({ access_token: accessToken });
        
        if (accounts.length > 0) {
          // Fetch and update balances for all accounts
          const accountsWithBalances = [];
          
          for (const acc of accounts) {
            try {
              const balance = await client.getBalance({ access_token: accessToken, account_id: acc.account_id });
              
              // Update DB with latest balance
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
                  balance: balance?.current ?? null,
                  available_balance: balance?.available ?? null,
                },
                create: {
                  user_id: userId,
                  provider: 'truelayer',
                  provider_account_id: acc.account_id,
                  account_name: acc.display_name || acc.account_number?.number || null,
                  currency: acc.currency || balance?.currency || null,
                  balance: balance?.current ?? null,
                  available_balance: balance?.available ?? null,
                },
              });
              
              accountsWithBalances.push({
                name: acc.display_name || acc.account_number?.number,
                balance: balance?.current ?? 0,
                available: balance?.available ?? 0,
                currency: balance?.currency || 'GBP',
              });
              
              console.log(`[Balance API LIVE] Account "${acc.display_name}": £${balance?.current?.toFixed(2)}`);
            } catch (balErr) {
              console.error(`Failed to fetch live balance for ${acc.account_id}:`, balErr.message);
            }
          }
          
          if (accountsWithBalances.length > 0) {
            // Log all accounts for debugging
            console.log(`[Balance API LIVE] Found ${accountsWithBalances.length} account(s):`);
            accountsWithBalances.forEach((a, i) => {
              console.log(`  [${i}] "${a.name}" £${(a.balance || 0).toFixed(2)}`);
            });

            // Prefer "current/main" account - exclude pots/savings
            const mainAccount =
              accountsWithBalances.find(a => {
                const name = (a.name || "").toLowerCase();
                // Exclude pots, savings, vaults, jars
                if (/\b(pot|savings|saving|vault|jar)\b/i.test(name)) return false;
                return true;
              }) ||
              // Fallback: look for "current" or "personal" in name
              accountsWithBalances.find(a => /\b(current|personal|main)\b/i.test(a.name || "")) ||
              accountsWithBalances[0];
            
            console.log(`[Balance API LIVE] Selected main: "${mainAccount.name}" £${mainAccount.balance.toFixed(2)}`);
            
            return res.json({
              totalBalance: mainAccount.balance,
              availableBalance: mainAccount.available,
              currency: mainAccount.currency,
              accounts: accountsWithBalances,
              source: 'live',
            });
          }
        }
      } catch (liveErr) {
        console.log(`[Balance API] Live fetch failed, falling back to DB:`, liveErr.message);
      }
    }

    // Fallback: Get from DB
    const accounts = await prisma.bankAccount.findMany({
      where: { user_id: userId, provider: "truelayer" },
      orderBy: [
        { created_at: "asc" },
        { provider_account_id: "asc" },
      ],
      select: {
        account_name: true,
        balance: true,
        available_balance: true,
        currency: true,
        provider_account_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (accounts.length === 0) {
      return res.json({ totalBalance: null, accounts: [] });
    }

    // Log all accounts for debugging
    console.log(`[Balance API DB] User ${userId} has ${accounts.length} account(s):`);
    accounts.forEach((a, i) => {
      console.log(`  [${i}] "${a.account_name}" £${(a.balance || 0).toFixed(2)}`);
    });

    // Prefer "current/main" account - exclude pots/savings
    const mainAccount =
      accounts.find(a => {
        const name = (a.account_name || "").toLowerCase();
        // Exclude pots, savings, vaults, jars
        if (/\b(pot|savings|saving|vault|jar)\b/i.test(name)) return false;
        return true;
      }) ||
      // Fallback: look for "current" or "personal" in name
      accounts.find(a => /\b(current|personal|main)\b/i.test(a.account_name || "")) ||
      accounts[0];

    console.log(`[Balance API DB] Selected main: "${mainAccount.account_name}" £${(mainAccount.balance || 0).toFixed(2)}`);

    return res.json({
      totalBalance: mainAccount.balance ?? 0,
      availableBalance: mainAccount.available_balance ?? 0,
      currency: mainAccount.currency || "GBP",
      accounts: accounts.map((a) => ({
        name: a.account_name,
        balance: a.balance,
        available: a.available_balance,
        currency: a.currency,
      })),
      source: 'db',
    });
  } catch (err) {
    console.error("Error fetching balance:", err);
    return res
      .status(500)
      .json({ error: "internal_error", message: err.message });
  }
});

// GET /api/banks/truelayer/balance-cached
// returns last stored balance from DB even if TL connection is expired/disconnected
router.get('/balance-cached', async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const accounts = await prisma.bankAccount.findMany({
      where: { user_id: userId, provider: 'truelayer' },
      orderBy: [
        { created_at: 'asc' }, // Same order as live endpoint - oldest first (main account)
        { provider_account_id: 'asc' },
      ],
      select: {
        account_name: true,
        balance: true,
        available_balance: true,
        currency: true,
        updated_at: true,
        created_at: true,
      },
    });

    if (!accounts.length) {
      return res.json({ totalBalance: null, availableBalance: null, currency: 'GBP', lastSyncedAt: null });
    }

    // Log all accounts for debugging
    console.log(`[Balance Cached] User ${userId} has ${accounts.length} account(s):`);
    accounts.forEach((a, i) => {
      console.log(`  [${i}] "${a.account_name}" £${(a.balance || 0).toFixed(2)}`);
    });

    // Pick "main" account - exclude pots/savings (Monzo uses "Pot" prefix for savings pots)
    // Also look for "Current" or "Personal" as positive indicators of main account
    const mainAccount =
      accounts.find(a => {
        const name = (a.account_name || "").toLowerCase();
        // Exclude pots, savings, vaults, jars
        if (/\b(pot|savings|saving|vault|jar)\b/i.test(name)) return false;
        return true;
      }) ||
      // Fallback: look for "current" or "personal" in name
      accounts.find(a => /\b(current|personal|main)\b/i.test(a.account_name || "")) ||
      accounts[0];

    const lastSyncedAt = mainAccount.updated_at;

    console.log(`[Balance Cached] Selected main: "${mainAccount.account_name}" £${(mainAccount.balance || 0).toFixed(2)}`);

    return res.json({
      totalBalance: mainAccount.balance ?? null,
      availableBalance: mainAccount.available_balance ?? null,
      currency: mainAccount.currency || 'GBP',
      lastSyncedAt,
      source: 'cached_db',
    });
  } catch (err) {
    console.error('Error fetching cached balance:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});


/**
 * DELETE /api/banks/truelayer/disconnect
 * Remove bank connection
 */
router.delete("/disconnect", async (req, res) => {
  try {
    const userId = req.auth?.sub;
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    await service.disconnectBank(prisma, userId);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error disconnecting bank:", err);
    return res
      .status(500)
      .json({ error: "internal_error", message: err.message });
  }
});

/**
 * Initialize router with Prisma client
 * @param {Object} prismaClient - Prisma client instance
 */
function init(prismaClient) {
  console.log('[TrueLayer] init() called with prismaClient:', !!prismaClient);
  prisma = prismaClient;
  console.log('[TrueLayer] prisma variable set to:', !!prisma);
  return router;
}

module.exports = init;
