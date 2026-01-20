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
 * 3) QUICK sync (balances + latest 30) so UI feels instant
 * 4) Redirect user back to frontend
 * 5) Full sync runs in background (don’t await)
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
        `${config.FRONTEND_URL}/wardeninsights?bankError=${encodeURIComponent(
          error
        )}`
      );
    }

    // Validate state and get userId
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

    // QUICK sync first (await) so UI has balance + latest 30 immediately
    try {
      console.log("[TrueLayer] Quick sync (latest 30) starting...");
      await service.quickSyncLatest(prisma, userId, { limit: 30, daysBack: 60 });
      console.log("[TrueLayer] Quick sync complete.");
    } catch (e) {
      console.error("[TrueLayer] Quick sync failed:", e);
      // still redirect; user can retry via 🔄
    }

    // Redirect immediately so the browser doesn't sit on /callback
    res.redirect(
      `${config.FRONTEND_URL}/wardeninsights?bankConnected=1&syncing=1`
    );

    // Full sync in background (don’t await)
    (async () => {
      console.log("[TrueLayer] Background full sync starting...");
      try {
        const syncResult = await service.syncAccountsAndTransactions(
          prisma,
          userId,
          {}
        );
        console.log(
          `[TrueLayer] Background full sync complete: ${syncResult.inserted} transactions`
        );
      } catch (e) {
        console.error("[TrueLayer] Background full sync failed:", e);
      }
    })();

    return; // prevent any further response attempts
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
 * Get the actual bank balance from connected accounts (from DB)
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

    // Get all bank accounts for user
    const accounts = await prisma.bankAccount.findMany({
      where: { user_id: userId, provider: "truelayer" },
      orderBy: [
        { created_at: "asc" }, // deterministic
        { provider_account_id: "asc" }, // deterministic tie-breaker
      ],
      select: {
        account_name: true,
        balance: true,
        available_balance: true,
        currency: true,
        provider_account_id: true,
        created_at: true,
      },
    });

    if (accounts.length === 0) {
      return res.json({ totalBalance: null, accounts: [] });
    }

    // Prefer "current/main" account over pots/savings
    const mainAccount =
      accounts.find(
        (a) => !/pot|savings|saving|vault|jar/i.test(a.account_name || "")
      ) || accounts[0];

    // Sum up all account balances for reference
    const totalAllAccounts = accounts.reduce(
      (sum, acc) => sum + (acc.balance || 0),
      0
    );

    console.log(
      `[Balance API] User ${userId}: Main account £${(
        mainAccount.balance || 0
      ).toFixed(2)}, Total (all pots) £${totalAllAccounts.toFixed(2)}`
    );

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
    });
  } catch (err) {
    console.error("Error fetching balance:", err);
    return res
      .status(500)
      .json({ error: "internal_error", message: err.message });
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
