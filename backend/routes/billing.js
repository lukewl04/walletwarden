/**
 * Billing Routes — Stripe Checkout, Customer Portal, current plan
 *
 * POST /billing/checkout   → create Stripe Checkout Session
 * POST /billing/portal     → create Stripe Customer Portal Session
 * GET  /billing/me          → return entitlement info from DB
 *
 * Auth required on all routes (uses existing auth middleware).
 * These routes NEVER touch roles — only the plan_tier / entitlement fields.
 */

const express = require('express');
const Stripe = require('stripe');
const { loadUserPlan } = require('../entitlements');
const { PLANS } = require('../plans');

module.exports = function billingRoutes(prisma) {
  const router = express.Router();

  // Lazy-init Stripe so the server still boots even if key is missing
  const stripe = process.env.STRIPE_SECRET_KEY
    ? Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

  const PRICE_MAP = {
    [PLANS.PLUS]: process.env.STRIPE_PLUS_PRICE_ID,
    [PLANS.PRO]:  process.env.STRIPE_PRO_PRICE_ID,
  };

  // ── helper: ensure the user has a Stripe customer ─────────────────
  async function ensureStripeCustomer(prisma, userId, planRow) {
    if (planRow.stripe_customer_id) return planRow.stripe_customer_id;

    const customer = await stripe.customers.create({
      metadata: { userId },
    });

    await prisma.userPlan.update({
      where: { user_id: userId },
      data: { stripe_customer_id: customer.id },
    });

    console.log(`[Billing] Created Stripe customer ${customer.id} for user ${userId}`);
    return customer.id;
  }

  // ── POST /billing/checkout ────────────────────────────────────────
  router.post('/checkout', async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'stripe_not_configured' });

      const userId = req.auth?.sub;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });

      const { tier } = req.body;
      if (!tier || !PRICE_MAP[tier]) {
        return res.status(400).json({
          error: 'invalid_tier',
          validTiers: Object.keys(PRICE_MAP),
        });
      }

      const priceId = PRICE_MAP[tier];
      if (!priceId) {
        return res.status(500).json({ error: 'price_id_not_configured', tier });
      }

      const planRow = await loadUserPlan(prisma, userId);
      const customerId = await ensureStripeCustomer(prisma, userId, planRow);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: (process.env.STRIPE_SUCCESS_URL || 'http://localhost:5173/billing/success') + '?session_id={CHECKOUT_SESSION_ID}',
        cancel_url:  process.env.STRIPE_CANCEL_URL  || 'http://localhost:5173/pricing',
        client_reference_id: userId,
        metadata: { userId, tier },
      });

      console.log(`[Billing] Checkout session ${session.id} created for ${userId} → ${tier}`);
      return res.json({ url: session.url });
    } catch (err) {
      console.error('[Billing] Checkout error:', err.message);
      return res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // ── POST /billing/portal ──────────────────────────────────────────
  router.post('/portal', async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'stripe_not_configured' });

      const userId = req.auth?.sub;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });

      const planRow = await loadUserPlan(prisma, userId);
      const customerId = await ensureStripeCustomer(prisma, userId, planRow);

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: process.env.STRIPE_PORTAL_RETURN_URL || 'http://localhost:5173/pricing',
      });

      console.log(`[Billing] Portal session created for ${userId}`);
      return res.json({ url: session.url });
    } catch (err) {
      console.error('[Billing] Portal error:', err.message);
      return res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // ── GET /billing/me ───────────────────────────────────────────────
  router.get('/me', async (req, res) => {
    try {
      const userId = req.auth?.sub;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });

      const planRow = await loadUserPlan(prisma, userId);

      return res.json({
        plan_tier:               planRow.plan,
        plan_status:             planRow.plan_status || null,
        plan_current_period_end: planRow.plan_current_period_end || null,
      });
    } catch (err) {
      console.error('[Billing] /me error:', err.message);
      return res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  return router;
};
