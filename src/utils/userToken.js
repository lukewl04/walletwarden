/**
 * User Token Utility
 * Uses Auth0 user ID when logged in, falls back to browser-generated ID for dev mode.
 */

const TOKEN_KEY = 'walletwarden-token';
const AUTH0_USER_KEY = 'walletwarden-auth0-user';
const AUTH0_USER_DATA_KEY = 'walletwarden-auth0-user-data';

/**
 * Set the Auth0 user when user logs in.
 * Stores both ID and full user data (including email).
 */
export function setAuth0User(user) {
  if (user?.sub) {
    localStorage.setItem(AUTH0_USER_KEY, user.sub);
    // Store full user object for email access
    localStorage.setItem(AUTH0_USER_DATA_KEY, JSON.stringify({
      sub: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture
    }));
    console.log('[Auth] Set Auth0 user:', user.sub, user.email);
  }
}

/**
 * Clear Auth0 user on logout
 */
export function clearAuth0User() {
  localStorage.removeItem(AUTH0_USER_KEY);
  localStorage.removeItem(AUTH0_USER_DATA_KEY);
}

/**
 * Get Auth0 user email if available
 */
export function getAuth0UserEmail() {
  try {
    const userData = localStorage.getItem(AUTH0_USER_DATA_KEY);
    if (userData) {
      const user = JSON.parse(userData);
      return user.email || null;
    }
  } catch (e) {
    console.error('[Auth] Error parsing user data:', e);
  }
  return null;
}

/**
 * Get the user token - prioritizes Auth0 user ID, falls back to browser ID.
 * This ensures data is tied to the Auth0 account when logged in.
 */
export function getUserToken() {
  // First, check if we have an Auth0 user ID
  const auth0UserId = localStorage.getItem(AUTH0_USER_KEY);
  if (auth0UserId) {
    return auth0UserId;
  }
  
  // Fall back to browser-generated token for dev mode / not logged in
  let token = localStorage.getItem(TOKEN_KEY);
  
  // Only create a NEW token if one doesn't exist at all
  // Don't replace 'dev-user' to avoid creating multiple entries
  if (!token) {
    token = `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(TOKEN_KEY, token);
    console.log('[Auth] Created new browser token:', token);
  }
  
  return token;
}

/**
 * Clear all user tokens (for full logout/reset)
 */
export function clearUserToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(AUTH0_USER_KEY);
  localStorage.removeItem(AUTH0_USER_DATA_KEY);
}

/**
 * Get authorization headers for API requests
 */
export function getAuthHeaders() {
  const headers = {
    Authorization: `Bearer ${getUserToken()}`
  };
  
  // Include email if available (from Auth0)
  const email = getAuth0UserEmail();
  console.log('[Auth] Getting headers, email:', email);
  if (email) {
    headers['X-User-Email'] = email;
  }
  
  return headers;
}
