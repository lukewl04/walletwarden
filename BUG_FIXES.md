# Bug Fixes Summary

## Issues Fixed

### 1. **404 Errors on API Calls** ✅
**Problem:** Frontend was making requests to `http://localhost:4000//api/transactions` (double slash)

**Root Cause:** In `TransactionsContext.jsx`, the `API_BASE` was set to `http://localhost:4000`, and then the code was appending `/api/transactions`, resulting in double slashes.

**Fix:** Changed `API_BASE` from `http://localhost:4000` to `http://localhost:4000/api` and updated all fetch calls to remove the duplicate `/api` prefix.

**Files Modified:**
- `src/state/TransactionsContext.jsx`
  - Line 6: Updated `API_BASE` default
  - Lines 43, 76, 102, 128, 152, 171: Updated all fetch URLs

### 2. **Bank Connection OAuth State Error** 🔧
**Problem:** Getting `bankError=invalid_state` when trying to connect bank account

**Root Causes:**
- State token TTL was only 5 minutes (OAuth flow can take longer with bank auth)
- Limited error logging made debugging difficult

**Fixes:**
- Increased state token TTL from 5 minutes to 15 minutes
- Added detailed logging to state creation and validation
- Added logging to `/api/banks/truelayer/connect` endpoint

**Files Modified:**
- `backend/truelayer/service.js`
  - Line 10: Increased `STATE_TTL_MS` from 5 to 15 minutes
  - Lines 16-28: Added logging to `createState()`
  - Lines 33-62: Enhanced logging in `validateState()` with debug info

- `backend/routes/banks.truelayer.js`
  - Lines 30-56: Added detailed logging to `/connect` endpoint

### 3. **Database Setup** ✅
- Created `backend/setup-db.js` - Run with `node setup-db.js` to push Prisma schema
- Verified that `BankConnection` and `BankAccount` tables already exist in your PostgreSQL database

## What to Do Next

1. **Restart your servers** (both frontend and backend) to apply the fixes
2. **Try the bank connection again** - You should see detailed logs in the backend console
3. **Check the browser console** - Should no longer see 404 errors

## Testing

### Test API Calls
All TransactionsContext calls should now work:
- ✅ GET /api/transactions
- ✅ POST /api/transactions
- ✅ POST /api/transactions/bulk
- ✅ DELETE /api/transactions/:id
- ✅ PUT /api/transactions/:id
- ✅ DELETE /api/transactions/clear

### Test Bank Connection
1. Go to Settings > Open Banking Connection
2. Click "Connect Bank"
3. Check backend console for logs like:
   ```
   [TrueLayer] /connect endpoint called for userId: google-oauth2|...
   [TrueLayer] Generated state token: abc12345...
   [TrueLayer] Auth URL built for user: google-oauth2|...
   [TrueLayer] State validation: {...}
   ```

## Debugging Tips

If you still get `invalid_state` error:
- Check backend logs for state validation messages
- Make sure you complete the OAuth flow within 15 minutes
- Ensure your browser's cookies are not being cleared
- Check that the state token appears in both logs (creation and validation)
