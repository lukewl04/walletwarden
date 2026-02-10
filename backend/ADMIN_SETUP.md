# Admin System Setup Guide

This guide explains how to set up and use the admin roles system in WalletWarden.

## What Was Added

### Backend
1. **Database Schema** - Added `role` field to `user_plans` table (default: 'user')
2. **Admin Middleware** (`backend/admin.js`) - Checks admin role from JWT or database
3. **Admin Routes** (`backend/routes/admin.js`) - CRUD endpoints for user management
4. **Protected Endpoints**:
   - `GET /api/admin/users` - List all users
   - `GET /api/admin/users/:userId` - Get user details
   - `POST /api/admin/users/:userId/plan` - Set user plan
   - `DELETE /api/admin/users/:userId/plan` - Remove plan (set to free)
   - `POST /api/admin/users/:userId/role` - Grant/revoke admin
   - `GET /api/admin/stats` - Dashboard statistics
   - `GET /api/me/role` - Check current user's role

### Frontend
1. **Admin Hook** (`src/hooks/useAdminRole.js`) - Checks if user has admin role
2. **Admin Dashboard** (`src/views/AdminDashboard.jsx`) - User management UI
3. **Options Integration** - Admin tab in Settings page (visible only to admins)
4. **Route** - `/admin` for the full admin dashboard

## Database Migration

Run the migration to add the role field:

```bash
cd walletwarden/backend
```

**Option 1: Using psql (recommended)**
```bash
psql $DATABASE_URL -f migrations/20260210_add_user_roles.sql
```

**Option 2: Using Prisma**
```bash
npx prisma db push
```

## Granting Admin Access

### In Development (Database)

Grant admin role directly in database:

```sql
-- Update existing user to admin
UPDATE user_plans SET role = 'admin' WHERE user_id = 'YOUR_USER_ID';

-- Or insert new admin user
INSERT INTO user_plans (id, user_id, plan, role) 
VALUES (gen_random_uuid(), 'YOUR_USER_ID', 'free', 'admin');
```

Replace `YOUR_USER_ID` with the actual user ID from Auth0 (e.g., `auth0|123abc...`)

To find your user ID:
1. Check browser console when logged in
2. Look at database: `SELECT user_id FROM user_plans;`
3. Check Auth0 dashboard

### In Production (Auth0 JWT)

Configure Auth0 to add role to JWT claims using Actions:

1. Go to Auth0 Dashboard → Actions → Flows → Login
2. Create a new Action:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://walletwarden.app';
  
  // Check if user has admin role (configure this logic as needed)
  // Example: check user metadata, app metadata, or database
  if (event.user.app_metadata?.role === 'admin') {
    api.accessToken.setCustomClaim(`${namespace}/role`, 'admin');
  }
};
```

3. Add the Action to your Login flow
4. Set user metadata in Auth0:
   - Go to Users → Select user → Metadata tab
   - Add to `app_metadata`: `{ "role": "admin" }`

## How It Works

### Authentication Flow

1. **Development**: 
   - Backend checks `user_plans.role` in database
   - Frontend token is just the user ID

2. **Production**:
   - Backend first checks JWT for `https://walletwarden.app/role` claim
   - Falls back to database if JWT claim not found
   - Auth0 adds role to JWT via Actions

### Access Control

- Admin middleware protects all `/api/admin/*` endpoints
- Frontend checks role via `useAdminRole()` hook
- Admin tab only visible if `isAdmin === true`
- Self-demotion prevented (admins can't remove their own admin role)

## Using the Admin Dashboard

1. **Access**: Settings → Admin Dashboard tab (only visible to admins)
2. **Features**:
   - View all users with their plans and roles
   - Set plan (Free/Plus/Pro) from dropdown
   - Grant admin (🛡️+) or revoke admin (🛡️−)
   - Remove plan (✗) to set user back to free
   - View statistics (total users, plan breakdown, admin count)

## Testing Locally

1. Run database migration
2. Grant yourself admin role in database
3. Start backend: `cd walletwarden/backend && node index.js`
4. Start frontend: `cd walletwarden && npm run dev`
5. Navigate to Settings → Admin Dashboard

## Security Notes

- All admin endpoints require authentication
- Admin middleware verifies role on every request
- JWT claims (production) take precedence over database
- Database fallback ensures dev mode works without Auth0
- Self-demotion is blocked to prevent accidental lockout

## Troubleshooting

**"Admin Dashboard tab not showing"**
- Check if your user has role='admin' in database
- Clear browser cache and reload
- Check browser console for errors

**"403 Forbidden on admin endpoints"**
- Verify role in database: `SELECT role FROM user_plans WHERE user_id = 'YOUR_ID';`
- Check backend logs for role verification messages
- Ensure backend is running latest code

**"Can't update user plans"**
- Check if user exists in database
- Verify authentication token is being sent
- Check backend logs for detailed error messages
