import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { setAuth0User, clearAuth0User, getAuthHeaders } from '../utils/userToken';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

/**
 * AuthSync - Syncs Auth0 user to localStorage and to the backend users table.
 * Must run before any other component makes API calls.
 */
export default function AuthSync({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth0();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && user) {
      // Store Auth0 credentials in localStorage first so getAuthHeaders() works
      setAuth0User(user);
      console.log('[AuthSync] User authenticated:', user.sub);

      // Sync user profile to the backend users table.
      // This creates the User row that every other table FK-references.
      fetch(`${API_URL}/me/sync`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email || null,
          name: user.name || null,
          picture: user.picture || null,
        }),
      })
        .then(res => res.json())
        .then(data => console.log('[AuthSync] User synced to backend:', data.id))
        .catch(err => console.error('[AuthSync] Failed to sync user to backend:', err));
    } else if (!isAuthenticated && !isLoading) {
      clearAuth0User();
      console.log('[AuthSync] User not authenticated, cleared stored credentials');
    }
  }, [isAuthenticated, user, isLoading]);

  return children;
}
