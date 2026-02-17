import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { setAuth0User, clearAuth0User } from '../utils/userToken';

const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

/**
 * AuthSync - Syncs Auth0 user to localStorage for API requests.
 * This ensures all API calls use the Auth0 user ID when logged in.
 * Also clears stale auth data on logout to prevent ghost sessions.
 * In dev mode, skips Auth0 entirely.
 */
export default function AuthSync({ children }) {
  // In dev mode, Auth0 is not used — skip all auth syncing
  if (isDevMode) {
    return children;
  }

  const { user, isAuthenticated, isLoading, error } = useAuth0();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && user) {
      // User is logged in - store their Auth0 ID
      setAuth0User(user);
      console.log('[AuthSync] User authenticated:', user.sub);
      console.log('[AuthSync] User email:', user.email || '(not provided)');
    } else if (!isAuthenticated && !isLoading) {
      // User explicitly logged out or not authenticated
      // Clear any stale auth data from localStorage
      clearAuth0User();
      console.log('[AuthSync] User not authenticated — cleared stale auth data');
      if (error) {
        console.error('[AuthSync] Auth0 error:', error.message);
      }
    }
  }, [isAuthenticated, user, isLoading, error]);

  return children;
}
