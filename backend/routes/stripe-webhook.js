/**
 * Stripe Webhook Handler — source of truth for plan tier
 *
 * POST /api/stripe/webhook
 *
 * This endpoint is mounted BEFORE express.json() so that the raw body is
 * available for Stripe signature verification.
 *
 * Handled events:
 *   checkout.session.completed       → activate plan after first payment
 *   customer.subscription.updated    → plan change / renewal / past_due
 *   customer.subscription.deleted    → downgrade to free
 *
 * Roles are NEVER modified here — only entitlement / plan fields.
 *
 * ── Local testing ──────────────────────────────────────────────────────
 * stripe listen --forward-to localhost:4000/api/stripe/webhook
 */

const Stripe = require('stripe');
const { planFromStripePrice, PLANS } = require('../plans');

module.exports = function createWebhookHandler(prisma) {
  const stripe = process.env.STRIPE_SECRET_KEY
    ? Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // ── Helper: find user plan row by various keys ─────────────────────
  async function findUserPlan({ subscriptionId, customerId, userId }) {
    if (userId) {
      const row = await prisma.userPlan.findUnique({ where: { user_id: userId } });
      if (row) return row;
    }
    if (subscriptionId) {
      const row = await prisma.userPlan.findFirst({ where: { stripe_subscription_id: subscriptionId } });
      if (row) return row;
    }
    if (customerId) {
      const row = await prisma.userPlan.findFirst({ where: { stripe_customer_id: customerId } });
      if (row) return row;
    }
    return null;
  }

  // ── D1: checkout.session.completed ─────────────────────────────────
  async function handleCheckoutCompleted(session) {
    const userId = session.metadata?.userId || session.client_reference_id;
    const tier   = session.metadata?.tier;

    if (!userId) {
      console.warn('[Webhook] checkout.session.completed — no userId in metadata or client_reference_id');
      return;
    }

    const plan = tier && Object.values(PLANS).includes(tier) ? tier : PLANS.FREE;

    await prisma.userPlan.update({
      where: { user_id: userId },
      data: {
        stripe_customer_id:     session.customer,
        stripe_subscription_id: session.subscription,
        plan,
        plan_status:            'active',
        started_at:             new Date(),
        updated_at:             new Date(),
      },
    });

    console.log(`[Webhook] checkout.session.completed — user ${userId} → ${plan}`);
  }

  // ── D2: customer.subscription.updated ──────────────────────────────
  async function handleSubscriptionUpdated(subscription) {
    const priceId = subscription.items?.data?.[0]?.price?.id;
    let tier = planFromStripePrice(priceId);

    const row = await findUserPlan({
      subscriptionId: subscription.id,
      customerId:     subscription.customer,
    });

    if (!row) {
      console.warn(`[Webhook] subscription.updated — no user found for sub ${subscription.id}`);
      return;
    }

    // If subscription is not active/trialing, downgrade to free
    const status = subscription.status; // active | trialing | past_due | canceled | incomplete | etc.
    if (status !== 'active' && status !== 'trialing') {
      tier = PLANS.FREE;
    }

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    await prisma.userPlan.update({
      where: { user_id: row.user_id },
      data: {
        plan:                     tier,
        plan_status:              status,
        plan_current_period_end:  periodEnd,
        stripe_subscription_id:   subscription.id,
        updated_at:               new Date(),
      },
    });

    console.log(`[Webhook] subscription.updated — user ${row.user_id} → ${tier} (${status})`);
  }

  // ── D3: customer.subscription.deleted ──────────────────────────────
  async function handleSubscriptionDeleted(subscription) {
    const row = await findUserPlan({
      subscriptionId: subscription.id,
      customerId:     subscription.customer,
    });

    if (!row) {
      console.warn(`[Webhook] subscription.deleted — no user found for sub ${subscription.id}`);
      return;
    }

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    await prisma.userPlan.update({
      where: { user_id: row.user_id },
      data: {
        plan:                     PLANS.FREE,
        plan_status:              'canceled',
        stripe_subscription_id:   null,
        plan_current_period_end:  periodEnd,
        cancelled_at:             new Date(),
        updated_at:               new Date(),
      },
    });

    console.log(`[Webhook] subscription.deleted — user ${row.user_id} → free`);
  }

  // ── Express handler ────────────────────────────────────────────────
  return async function webhookHandler(req, res) {
    let event;

    // Verify Stripe signature
    if (webhookSecret && stripe) {
      const sig = req.headers['stripe-signature'];
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        console.error('[Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: 'signature_invalid' });
      }
    } else {
      // Dev fallback: parse body directly (no signature check)
      console.warn('[Webhook] No STRIPE_WEBHOOK_SECRET — skipping signature verification');
      try {
        event = JSON.parse(req.body.toString());
      } catch {
        return res.status(400).json({ error: 'invalid_json' });
      }
    }

    console.log(`[Webhook] Event received: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;

        default:
          console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }
    } catch (err) {
      console.error(`[Webhook] Error handling ${event.type}:`, err.message);
      // Return 200 to Stripe so it doesn't retry on app-level errors
    }

    return res.json({ received: true });
  };
};
