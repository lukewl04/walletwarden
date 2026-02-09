/**
 * Subscription & Entitlements Routes
 *
 * GET  /api/entitlements        — current user's plan + capability flags + usage
 * POST /api/subscription/change — upgrade / downgrade (Stripe-ready stub)
 * POST /api/subscription/stripe-webhook — Stripe webhook handler (stub)
 */

const express = require('express');
const { getEntitlements, PLANS, isUpgrade, isDowngrade, planFromStripePrice } = require('../plans');
const { loadUserPlan, getWeeklyBankUsage } = require('../entitlements');

module.exports = function subscriptionRoutes(prisma) {
  const router = express.Router();

  // ── GET /api/entitlements ───────────────────────────────────────────
  // Returns capability flags the frontend uses to gate UI.
  //
  // Response shape:
  // {
  //   plan, label, priceMonthly,
  //   canExport, canUseLLM, canCustomiseInsights, fullInsights,
  //   weeklyBankLimit, bankConnectionsUsed, bankConnectionsRemaining
  // }
  router.get('/entitlements', async (req, res) => {
    try {
      const userId = req.auth?.sub;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });

      // req.entitlements is attached by attachEntitlements middleware
      if (req.entitlements) {
        return res.json(req.entitlements);
      }

      // Fallback: compute if middleware didn't run
      const planRow = await loadUserPlan(prisma, userId);
      const ent = getEntitlements(planRow.plan);
      const used = await getWeeklyBankUsage(prisma, userId);

      return res.json({
        ...ent,
        bankConnectionsUsed: used,
        bankConnectionsRemaining:
          ent.weeklyBankLimit === Infinity
            ? Infinity
            : Math.max(0, ent.weeklyBankLimit - used),
      });
    } catch (err) {
      console.error('[Entitlements] GET error:', err.message);
      return res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // ── POST /api/subscription/change ──────────────────────────────────
  // Direct plan change (for dev / admin). In production, Stripe webhooks
  // handle this. Accepts { plan: 'plus' | 'pro' | 'free' }.
  router.post('/subscription/change', async (req, res) => {
    try {
      const userId = req.auth?.sub;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });

      const { plan } = req.body;
      if (!plan || !Object.values(PLANS).includes(plan)) {
        return res.status(400).json({ error: 'invalid_plan', validPlans: Object.values(PLANS) });
      }

      const current = await loadUserPlan(prisma, userId);

      const updated = await prisma.userPlan.update({
        where: { user_id: userId },
        data: {
          plan,
          started_at: new Date(),
          cancelled_at: plan === PLANS.FREE ? new Date() : null,
          updated_at: new Date(),
        },
      });

      const ent = getEntitlements(updated.plan);
      const used = await getWeeklyBankUsage(prisma, userId);

      console.log(`[Subscription] ${userId}: ${current.plan} → ${plan} (${isUpgrade(current.plan, plan) ? 'upgrade' : isDowngrade(current.plan, plan) ? 'downgrade' : 'same'})`);

      return res.json({
        ok: true,
        previousPlan: current.plan,
        ...ent,
        bankConnectionsUsed: used,
        bankConnectionsRemaining:
          ent.weeklyBankLimit === Infinity
            ? Infinity
            : Math.max(0, ent.weeklyBankLimit - used),
      });
    } catch (err) {
      console.error('[Subscription] Change error:', err.message);
      return res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  // ── POST /api/subscription/stripe-webhook ──────────────────────────
  // Stub for Stripe webhook events. Wire up when Stripe is integrated.
  //
  // Expected events:
  //   checkout.session.completed  → set plan from price ID
  //   customer.subscription.updated → handle upgrade/downgrade
  //   customer.subscription.deleted → revert to free
  //   invoice.payment_failed       → grace period / revert
  router.post('/subscription/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    // TODO: Verify Stripe signature with stripe.webhooks.constructEvent
    // TODO: Parse event type and update user_plans accordingly
    //
    // Pseudo-code:
    // const event = stripe.webhooks.constructEvent(req.body, sig, secret);
    // if (event.type === 'checkout.session.completed') {
    //   const priceId = event.data.object.items[0].price.id;
    //   const plan = planFromStripePrice(priceId);
    //   await prisma.userPlan.update({ where: ..., data: { plan } });
    // }

    console.log('[Stripe Webhook] Received event (stub)');
    return res.json({ received: true });
  });

  return router;
};
