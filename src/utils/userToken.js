/**
 * User Token Utility
 * Uses Auth0 user ID when logged in, falls back to browser-generated ID for dev mode.
 */

const TOKEN_KEY = 'walletwarden-token';
const AUTH0_USER_KEY = 'walletwarden-auth0-user';

/**
 * Set the Auth0 user ID when user logs in.
 * This should be called from the Auth0 provider when user authenticates.
 */
export function setAuth0User(user) {
  if (user?.sub) {
    localStorage.setItem(AUTH0_USER_KEY, user.sub);
    console.log('[Auth] Set Auth0 user:', user.sub);
  }
}

/**
 * Clear Auth0 user on logout
 */
export function clearAuth0User() {
  localStorage.removeItem(AUTH0_USER_KEY);
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
  
  // If no token exists, or it's the old shared "dev-user" token, create a unique one
  if (!token || token === 'dev-user') {
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
}

/**
 * Get authorization headers for API requests
 */
export function getAuthHeaders() {
  return {
    Authorization: `Bearer ${getUserToken()}`
  };
}
