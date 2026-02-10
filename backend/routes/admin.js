/**
 * routes/admin.js — Admin-only endpoints for user management.
 * 
 * All endpoints require admin role (enforced by requireAdmin middleware).
 * Provides CRUD operations for user plans and roles.
 */

const express = require('express');
const { requireAdmin } = require('../admin');
const { PLANS } = require('../plans');

module.exports = function adminRoutes(prisma) {
  const router = express.Router();

  // Apply admin middleware to all routes
  router.use(requireAdmin(prisma));

  /**
   * GET /api/admin/users
   * List all users with their plans and roles.
   */
  router.get('/users', async (req, res) => {
    try {
      const users = await prisma.userPlan.findMany({
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          user_id: true,
          email: true,
          plan: true,
          role: true,
          plan_status: true,
          stripe_customer_id: true,
          stripe_subscription_id: true,
          plan_current_period_end: true,
          started_at: true,
          expires_at: true,
          cancelled_at: true,
          created_at: true,
          updated_at: true,
        },
      });

      console.log(`[Admin] Listed ${users.length} users`);
      return res.json({ users });
    } catch (err) {
      console.error('[Admin] Error listing users:', err);
      return res.status(500).json({ 
        error: 'internal_error', 
        message: err.message 
      });
    }
  });

  /**
   * GET /api/admin/users/:userId
   * Get details for a specific user.
   */
  router.get('/users/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await prisma.userPlan.findUnique({
        where: { user_id: userId },
      });

      if (!user) {
        return res.status(404).json({ 
          error: 'not_found', 
          message: 'User not found' 
        });
      }

      console.log(`[Admin] Retrieved user ${userId}`);
      return res.json({ user });
    } catch (err) {
      console.error('[Admin] Error getting user:', err);
      return res.status(500).json({ 
        error: 'internal_error', 
        message: err.message 
      });
    }
  });

  /**
   * POST /api/admin/users/:userId/plan
   * Set or update a user's plan.
   * Body: { plan: 'free' | 'plus' | 'pro' }
   */
  router.post('/users/:userId/plan', async (req, res) => {
    try {
      const { userId } = req.params;
      const { plan } = req.body;

      // Validate plan
      const validPlans = [PLANS.FREE, PLANS.PLUS, PLANS.PRO];
      if (!validPlans.includes(plan)) {
        return res.status(400).json({ 
          error: 'invalid_plan', 
          message: `Plan must be one of: ${validPlans.join(', ')}` 
        });
      }

      // Update or create user plan
      const updated = await prisma.userPlan.upsert({
        where: { user_id: userId },
        update: { 
          plan,
          plan_status: 'active',
          updated_at: new Date(),
        },
        create: {
          user_id: userId,
          plan,
          plan_status: 'active',
        },
      });

      console.log(`[Admin] Set plan ${plan} for user ${userId}`);
      return res.json({ 
        success: true, 
        user: updated,
        message: `Plan updated to ${plan}` 
      });
    } catch (err) {
      console.error('[Admin] Error updating plan:', err);
      return res.status(500).json({ 
        error: 'internal_error', 
        message: err.message 
      });
    }
  });

  /**
   * DELETE /api/admin/users/:userId/plan
   * Remove user's plan (set to free).
   */
  router.delete('/users/:userId/plan', async (req, res) => {
    try {
      const { userId } = req.params;

      const updated = await prisma.userPlan.upsert({
        where: { user_id: userId },
        update: { 
          plan: PLANS.FREE,
          plan_status: null,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          plan_current_period_end: null,
          expires_at: null,
          cancelled_at: new Date(),
          updated_at: new Date(),
        },
        create: {
          user_id: userId,
          plan: PLANS.FREE,
        },
      });

      console.log(`[Admin] Removed plan for user ${userId} (set to free)`);
      return res.json({ 
        success: true, 
        user: updated,
        message: 'Plan removed (set to free)' 
      });
    } catch (err) {
      console.error('[Admin] Error removing plan:', err);
      return res.status(500).json({ 
        error: 'internal_error', 
        message: err.message 
      });
    }
  });

  /**
   * POST /api/admin/users/:userId/role
   * Grant or revoke admin role.
   * Body: { role: 'user' | 'admin' }
   */
  router.post('/users/:userId/role', async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      // Validate role
      const validRoles = ['user', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ 
          error: 'invalid_role', 
          message: `Role must be one of: ${validRoles.join(', ')}` 
        });
      }

      // Prevent self-demotion
      const adminUserId = req.auth?.sub;
      if (userId === adminUserId && role === 'user') {
        return res.status(400).json({ 
          error: 'self_demotion', 
          message: 'Cannot remove your own admin role' 
        });
      }

      // Update or create user role
      const updated = await prisma.userPlan.upsert({
        where: { user_id: userId },
        update: { 
          role,
          updated_at: new Date(),
        },
        create: {
          user_id: userId,
          plan: PLANS.FREE,
          role,
        },
      });

      const action = role === 'admin' ? 'granted' : 'revoked';
      console.log(`[Admin] ${action} admin for user ${userId}`);
      return res.json({ 
        success: true, 
        user: updated,
        message: `Admin role ${action}` 
      });
    } catch (err) {
      console.error('[Admin] Error updating role:', err);
      return res.status(500).json({ 
        error: 'internal_error', 
        message: err.message 
      });
    }
  });

  /**
   * GET /api/admin/stats
   * Get admin dashboard statistics.
   */
  router.get('/stats', async (req, res) => {
    try {
      const [
        totalUsers,
        freeUsers,
        plusUsers,
        proUsers,
        adminUsers,
      ] = await Promise.all([
        prisma.userPlan.count(),
        prisma.userPlan.count({ where: { plan: PLANS.FREE } }),
        prisma.userPlan.count({ where: { plan: PLANS.PLUS } }),
        prisma.userPlan.count({ where: { plan: PLANS.PRO } }),
        prisma.userPlan.count({ where: { role: 'admin' } }),
      ]);

      const stats = {
        totalUsers,
        planBreakdown: {
          free: freeUsers,
          plus: plusUsers,
          pro: proUsers,
        },
        adminUsers,
      };

      console.log('[Admin] Retrieved stats:', stats);
      return res.json({ stats });
    } catch (err) {
      console.error('[Admin] Error getting stats:', err);
      return res.status(500).json({ 
        error: 'internal_error', 
        message: err.message 
      });
    }
  });

  return router;
};
