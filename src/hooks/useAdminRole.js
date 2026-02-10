/**
 * useAdminRole.js — Hook to check if current user has admin role.
 * 
 * Fetches role from backend API which checks both JWT claims and database.
 */

import { useState, useEffect } from 'react';
import { getUserToken } from '../utils/userToken';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function useAdminRole() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function checkAdminRole() {
      try {
        setLoading(true);
        const token = getUserToken();
        
        console.log('[Admin Hook] Checking admin role for token:', token);
        console.log('[Admin Hook] API URL:', `${API_URL}/me/role`);
        
        const response = await fetch(`${API_URL}/me/role`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error('[Admin Hook] Response not OK:', response.status);
          throw new Error(`Failed to check role: ${response.status}`);
        }

        const data = await response.json();
        console.log('[Admin Hook] Received role data:', data);
        
        if (isMounted) {
          const adminStatus = data.role === 'admin';
          console.log('[Admin Hook] Setting isAdmin to:', adminStatus);
          setIsAdmin(adminStatus);
          setError(null);
        }
      } catch (err) {
        console.error('[Admin] Error checking role:', err);
        if (isMounted) {
          setIsAdmin(false);
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkAdminRole();

    return () => {
      isMounted = false;
    };
  }, []);

  return { isAdmin, loading, error };
}
