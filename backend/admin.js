/**
 * admin.js — Admin role middleware for protecting admin-only endpoints.
 * 
 * Checks if the authenticated user has the 'admin' role from either:
 * 1. Auth0 JWT claims (production)
 * 2. Database role field (dev fallback)
 */

const { withRetry } = require('./db-retry');

const ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

// ── Simple in-memory cache for role lookups ─────────────────────────────
const roleCache = new Map();
const ROLE_CACHE_TTL = 30_000; // 30 seconds

function getCachedRole(userId) {
  const entry = roleCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expires) { roleCache.delete(userId); return null; }
  return entry.data;
}
function setCachedRole(userId, data) {
  roleCache.set(userId, { data, expires: Date.now() + ROLE_CACHE_TTL });
}

/**
 * Extract role from Auth0 JWT claims (production).
 * Looks for role in custom namespace or permissions array.
 */
function getRoleFromJWT(req) {
  // Check for role in custom claim (configure this in Auth0 Actions)
  const customClaim = req.auth?.['https://walletwarden.app/role'];
  if (customClaim) return customClaim;

  // Check permissions array (alternative pattern)
  const permissions = req.auth?.permissions || [];
  if (permissions.includes('admin')) return ROLES.ADMIN;

  return null;
}

/**
 * Get user's role from database or JWT.
 * In production, JWT takes precedence. In dev, falls back to DB.
 */
async function getUserRole(prisma, req) {
  const userId = req.auth?.sub;
  if (!userId) return ROLES.USER;

  // Try JWT first (production)
  const jwtRole = getRoleFromJWT(req);
  if (jwtRole) {
    console.log(`[Admin] Role from JWT: ${jwtRole} for user ${userId}`);
    return jwtRole;
  }

  // Check cache
  const cached = getCachedRole(userId);
  if (cached) return cached;

  // Fallback to database (dev mode)
  const userPlan = await withRetry(
    () => prisma.userPlan.findUnique({
      where: { user_id: userId },
      select: { role: true },
    }),
    { label: 'Admin', retries: 2 }
  );

  const role = userPlan?.role || ROLES.USER;
  setCachedRole(userId, role);
  console.log(`[Admin] Role from DB: ${role} for user ${userId}`);
  return role;
}

/**
 * Middleware to check if user has admin role.
 * Blocks request with 403 if not admin.
 * 
 * Usage: app.use('/api/admin', requireAdmin(prisma));
 */
function requireAdmin(prisma) {
  return async (req, res, next) => {
    try {
      const userId = req.auth?.sub;
      if (!userId) {
        return res.status(401).json({ 
          error: 'unauthorized', 
          message: 'Authentication required' 
        });
      }

      const role = await getUserRole(prisma, req);
      
      if (role !== ROLES.ADMIN) {
        console.log(`[Admin] Access denied for user ${userId} with role ${role}`);
        return res.status(403).json({ 
          error: 'forbidden', 
          message: 'Admin access required' 
        });
      }

      // Attach role to request for downstream use
      req.userRole = role;
      next();
    } catch (err) {
      console.error('[Admin] Error checking role:', err.message);
      return res.status(500).json({ 
        error: 'internal_error', 
        message: 'Failed to verify admin access' 
      });
    }
  };
}

/**
 * Middleware to attach user role to request without blocking.
 * Useful for endpoints that need to know role but don't require admin.
 * 
 * Usage: app.use(attachRole(prisma));
 */
function attachRole(prisma) {
  return async (req, res, next) => {
    try {
      const userId = req.auth?.sub;
      if (!userId) {
        req.userRole = ROLES.USER;
        return next();
      }

      const role = await getUserRole(prisma, req);
      req.userRole = role;
      next();
    } catch (err) {
      console.error('[Admin] Error attaching role:', err.message);
      req.userRole = ROLES.USER;
      next();
    }
  };
}

module.exports = {
  ROLES,
  requireAdmin,
  attachRole,
  getUserRole,
};
