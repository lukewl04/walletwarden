/**
 * entitlements.js — Middleware & helpers for server-side plan enforcement.
 *
 * Attaches the user's entitlements to `req.entitlements` for downstream use.
 * Provides guard middleware generators: `requireCapability('canExport')`.
 *
 * All plan logic flows through plans.js – this file never hard-codes tier names.
 */

const { getEntitlements, getCurrentWeekStart, PLANS } = require('./plans');

// ── Load user plan from DB (with auto-provision for new users) ──────────
async function loadUserPlan(prisma, userId, userEmail = null) {
  // Ensure the User row exists first (FK constraint from user_plans -> users).
  // This is the safety net for any request that arrives before /api/me/sync fires.
  await prisma.user.upsert({
    where: { id: userId },
    update: userEmail ? { email: userEmail } : {},
    create: { id: userId, email: userEmail || null },
  });

  // Upsert to avoid race conditions when multiple concurrent requests arrive
  // for a brand-new user before any row exists.
  const row = await prisma.userPlan.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      email: userEmail,
      plan: PLANS.FREE,
    },
    update: userEmail ? { email: userEmail } : {},
  });

  return row;
}

// ── Weekly bank-connection usage ────────────────────────────────────────
async function getWeeklyBankUsage(prisma, userId) {
  const weekStart = getCurrentWeekStart();

  const row = await prisma.bankConnectionUsage.findUnique({
    where: { user_id_week_start: { user_id: userId, week_start: new Date(weekStart) } },
  });

  return row?.connections_used ?? 0;
}

async function incrementBankUsage(prisma, userId) {
  const weekStart = getCurrentWeekStart();

  await prisma.bankConnectionUsage.upsert({
    where: { user_id_week_start: { user_id: userId, week_start: new Date(weekStart) } },
    update: { connections_used: { increment: 1 }, updated_at: new Date() },
    create: { user_id: userId, week_start: new Date(weekStart), connections_used: 1 },
  });
}

// ── Express middleware: attach entitlements to req ──────────────────────
/**
 * Creates middleware that loads the user's plan + usage and attaches
 * `req.entitlements` (capability flags) and `req.userPlan` (raw DB row).
 *
 * Usage: app.use(attachEntitlements(prisma));
 */
function attachEntitlements(prisma) {
  return async (req, res, next) => {
    try {
      const userId = req.auth?.sub;
      if (!userId) return next(); // unauthenticated – let auth middleware handle

      // Extract email from JWT if available (Auth0 includes email in token)
      const userEmail = req.auth?.email || req.auth?.['https://walletwarden.app/email'];
      
      const planRow = await loadUserPlan(prisma, userId, userEmail);
      const ent = getEntitlements(planRow.plan);
      const bankUsedThisWeek = await getWeeklyBankUsage(prisma, userId);

      req.userPlan = planRow;
      req.entitlements = {
        ...ent,
        bankConnectionsUsed: bankUsedThisWeek,
        bankConnectionsRemaining:
          ent.weeklyBankLimit === Infinity
            ? Infinity
            : Math.max(0, ent.weeklyBankLimit - bankUsedThisWeek),
      };

      next();
    } catch (err) {
      console.error('[Entitlements] Error loading plan:', err.message);
      // Fail-open to Free tier so the app doesn't break
      req.entitlements = { ...getEntitlements(PLANS.FREE), bankConnectionsUsed: 0, bankConnectionsRemaining: 1 };
      next();
    }
  };
}

// ── Guard middleware: require a boolean capability flag ─────────────────
/**
 * Usage:  router.post('/llm', requireCapability('canUseLLM'), handler);
 *
 * Returns 403 with a structured error when the user's plan lacks the flag.
 */
function requireCapability(capabilityName) {
  return (req, res, next) => {
    if (!req.entitlements) {
      return res.status(500).json({ error: 'entitlements_not_loaded' });
    }

    if (!req.entitlements[capabilityName]) {
      return res.status(403).json({
        error: 'plan_limit',
        capability: capabilityName,
        currentPlan: req.entitlements.plan,
        message: `Your ${req.entitlements.label} plan does not include this feature. Please upgrade.`,
      });
    }

    next();
  };
}

/**
 * Guard specifically for bank connection limits (numeric, not boolean).
 * Returns 403 with usage details when the weekly limit is reached.
 */
function requireBankConnectionQuota(req, res, next) {
  if (!req.entitlements) {
    return res.status(500).json({ error: 'entitlements_not_loaded' });
  }

  if (req.entitlements.bankConnectionsRemaining <= 0) {
    return res.status(403).json({
      error: 'plan_limit',
      capability: 'weeklyBankLimit',
      currentPlan: req.entitlements.plan,
      used: req.entitlements.bankConnectionsUsed,
      limit: req.entitlements.weeklyBankLimit,
      message: `You've used all ${req.entitlements.weeklyBankLimit} bank connection(s) this week. Upgrade for more.`,
    });
  }

  next();
}

module.exports = {
  loadUserPlan,
  getWeeklyBankUsage,
  incrementBankUsage,
  attachEntitlements,
  requireCapability,
  requireBankConnectionQuota,
};
