import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { setAuth0User, clearAuth0User } from '../utils/userToken';

const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

/**
 * AuthSync - Syncs Auth0 user to localStorage for API requests.
 * This ensures all API calls use the Auth0 user ID when logged in.
 * Also clears stale auth data on logout to prevent ghost sessions.
 * In dev mode, skips Auth0 sync logic but hooks are still called (Rules of Hooks).
 */
export default function AuthSync({ children }) {
  const { user, isAuthenticated, isLoading, error } = useAuth0();

  useEffect(() => {
    // In dev mode, don't sync Auth0 state
    if (isDevMode) return;
    if (isLoading) return;

    if (isAuthenticated && user) {
      setAuth0User(user);
      console.log('[AuthSync] User authenticated:', user.sub);
      console.log('[AuthSync] User email:', user.email || '(not provided)');
    } else if (!isAuthenticated && !isLoading) {
      clearAuth0User();
      console.log('[AuthSync] User not authenticated — cleared stale auth data');
      if (error) {
        console.error('[AuthSync] Auth0 error:', error.message);
      }
    }
  }, [isAuthenticated, user, isLoading, error]);

  return children;
}
