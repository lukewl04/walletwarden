# Admin System - Quick Reference

## 🚀 Getting Started (Dev Mode)

### 1. Database is ready ✅
Role field added, existing users updated, dev-user has admin access

### 2. Start the app
```bash
# Terminal 1 - Backend
cd walletwarden/backend
node index.js

# Terminal 2 - Frontend  
cd walletwarden
npm run dev
```

### 3. Access Admin Dashboard
1. Open http://localhost:5173/options
2. Click "🛡️ Admin Dashboard" tab (visible only to admins)
3. Click "Open Admin Dashboard" button
4. Or go directly to http://localhost:5173/admin

## 👤 Current Admin User
- **User ID**: `dev-user`
- **Plan**: Pro
- **Role**: Admin

## 🔧 Management Commands

```bash
# In walletwarden/backend/ directory:

# List all users
node list-users.js

# Grant admin to any user
node grant-admin.js <user_id>

# Examples:
node grant-admin.js dev-user
node grant-admin.js auth0|123abc...
node grant-admin.js google-oauth2|456def...
```

## 📊 Admin Dashboard Features

### Stats Cards (Top)
- Total users count
- Users per plan (Free, Plus, Pro)
- Total admin users

### User Table (Main)
Each row shows:
- **User ID** (truncated, hover for full)
- **Role Badge** (🛡️ Admin or 👤 User)
- **Plan Badge** (Free/Plus/Pro with colors)
- **Status** (active/trialing/past_due/canceled)
- **Created Date**

### Actions (Per User)
1. **Plan Dropdown** - Change user's plan (Free/Plus/Pro)
2. **Admin Toggle** - Grant (🛡️+) or revoke (🛡️−) admin
3. **Remove Plan** (✗) - Set user back to free (only shown for paid plans)

## 🔐 API Endpoints

### Public
- `GET /api/me/role` - Get current user's role

### Admin Only (403 if not admin)
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:userId` - Get user details
- `GET /api/admin/stats` - Dashboard stats
- `POST /api/admin/users/:userId/plan` - Set plan
  - Body: `{ "plan": "free" | "plus" | "pro" }`
- `DELETE /api/admin/users/:userId/plan` - Remove plan (set free)
- `POST /api/admin/users/:userId/role` - Update role
  - Body: `{ "role": "user" | "admin" }`

## 🧪 Testing

### Test as Admin (dev-user)
1. Use token `dev-user` (already set in dev mode)
2. See admin tab in Settings
3. Access /admin dashboard
4. Manage users

### Test as Regular User
1. Grant yourself a non-admin user ID:
   ```bash
   # Create a test user with regular role
   node grant-admin.js test-user  # This grants admin
   # Then manually set back to user in DB or via admin UI
   ```
2. Admin tab won't appear
3. Direct /admin access will show errors

## 🛡️ Auth0 Production Setup

When ready for production with Auth0:

1. **Create Auth0 Action** (Dashboard → Actions → Flows → Login)
```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://walletwarden.app';
  
  if (event.user.app_metadata?.role === 'admin') {
    api.accessToken.setCustomClaim(`${namespace}/role`, 'admin');
  }
};
```

2. **Set user as admin** (Dashboard → Users → Select → Metadata)
```json
{
  "role": "admin"
}
```

3. **Deploy** - Auth0 will now include role in JWT
4. **Backend** will automatically prefer JWT role over database

## 🐛 Troubleshooting

### Admin tab not showing
- Check: `node backend/list-users.js` - Is your user ID an admin?
- Grant admin: `node backend/grant-admin.js <your-user-id>`
- Clear browser cache and reload

### 403 errors on admin endpoints
- Verify role in DB: `node backend/list-users.js`
- Check backend console for role verification logs
- Ensure correct user token in Authorization header

### Role shows as undefined
- Run: `node backend/update-existing-roles.js`
- Run: `npx prisma generate` in backend/

## 📝 Notes

- Admin role is separate from subscription plan
- Free plan users can be admins
- Admins can't remove their own admin role (self-demotion blocked)
- All actions require confirmation for destructive operations
- Changes take effect immediately (no page reload needed)

## 📚 Full Documentation

- [ADMIN_IMPLEMENTATION.md](ADMIN_IMPLEMENTATION.md) - Complete implementation details
- [backend/ADMIN_SETUP.md](backend/ADMIN_SETUP.md) - Detailed setup guide

---

**Quick Tip**: Run `node backend/list-users.js` anytime to see all users and their roles!
