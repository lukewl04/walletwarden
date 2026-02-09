/**
 * plans.js — Single source of truth for plan definitions and entitlements.
 *
 * Every feature gate in the app reads from this file.
 * To add a new plan or capability, edit ONLY this file.
 *
 * Stripe product IDs are mapped to the internal plan enum here,
 * keeping Stripe coupling out of business logic.
 */

// ── Plan enum ───────────────────────────────────────────────────────────
const PLANS = Object.freeze({
  FREE: 'free',
  PLUS: 'plus',
  PRO:  'pro',
});

// ── Capability definitions per plan ─────────────────────────────────────
const PLAN_ENTITLEMENTS = Object.freeze({
  [PLANS.FREE]: {
    plan: PLANS.FREE,
    label: 'Free',
    priceMonthly: 0,
    // Feature flags
    canExport:              false,
    canUseLLM:              false,
    canCustomiseInsights:   false,
    fullInsights:           false,
    weeklyBankLimit:        1,
  },
  [PLANS.PLUS]: {
    plan: PLANS.PLUS,
    label: 'Plus',
    priceMonthly: 5.00,
    canExport:              true,
    canUseLLM:              false,
    canCustomiseInsights:   false,
    fullInsights:           false,
    weeklyBankLimit:        3,
  },
  [PLANS.PRO]: {
    plan: PLANS.PRO,
    label: 'Pro',
    priceMonthly: 6.99,
    canExport:              true,
    canUseLLM:              true,
    canCustomiseInsights:   true,
    fullInsights:           true,
    weeklyBankLimit:        Infinity,  // unlimited
  },
});

// ── Helper: resolve entitlements for a plan string ──────────────────────
function getEntitlements(plan) {
  return PLAN_ENTITLEMENTS[plan] || PLAN_ENTITLEMENTS[PLANS.FREE];
}

// ── Stripe ↔ internal plan mapping ──────────────────────────────────────
// Populate these from your Stripe dashboard when you create products.
const STRIPE_PRICE_TO_PLAN = Object.freeze({
  // 'price_xxxxxxxxxxxxx': PLANS.PLUS,
  // 'price_yyyyyyyyyyyyy': PLANS.PRO,
});

function planFromStripePrice(priceId) {
  return STRIPE_PRICE_TO_PLAN[priceId] || PLANS.FREE;
}

// ── Plan ordering (for upgrade / downgrade checks) ──────────────────────
const PLAN_ORDER = [PLANS.FREE, PLANS.PLUS, PLANS.PRO];

function isUpgrade(fromPlan, toPlan) {
  return PLAN_ORDER.indexOf(toPlan) > PLAN_ORDER.indexOf(fromPlan);
}

function isDowngrade(fromPlan, toPlan) {
  return PLAN_ORDER.indexOf(toPlan) < PLAN_ORDER.indexOf(fromPlan);
}

// ── ISO week helper (Monday‑based) ──────────────────────────────────────
function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sun, 1 = Mon, …
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

module.exports = {
  PLANS,
  PLAN_ENTITLEMENTS,
  getEntitlements,
  planFromStripePrice,
  isUpgrade,
  isDowngrade,
  getCurrentWeekStart,
  STRIPE_PRICE_TO_PLAN,
};
