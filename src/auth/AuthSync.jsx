import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { setAuth0User, clearAuth0User } from '../utils/userToken';

/**
 * AuthSync - Syncs Auth0 user to localStorage for API requests.
 * This ensures all API calls use the Auth0 user ID when logged in.
 */
export default function AuthSync({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth0();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && user) {
      // User is logged in - store their Auth0 ID
      setAuth0User(user);
      console.log('[AuthSync] User authenticated:', user.sub);
    } else {
      // User logged out - clear Auth0 ID (will fall back to browser token)
      clearAuth0User();
      console.log('[AuthSync] User not authenticated, using browser token');
    }
  }, [isAuthenticated, user, isLoading]);

  return children;
}
