/**
 * EntitlementsContext — frontend single source of truth for the user's plan & capabilities.
 *
 * Fetches entitlements once on mount, re-fetches after plan changes.
 * All UI gating reads from useEntitlements() — no scattered plan checks.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { getUserToken } from '../utils/userToken';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const EntitlementsContext = createContext(null);

// Default (Free tier) — used while loading or on error
const FREE_DEFAULTS = Object.freeze({
  plan: 'free',
  label: 'Free',
  priceMonthly: 0,
  canExport: false,
  canUseLLM: false,
  canCustomiseInsights: false,
  fullInsights: false,
  weeklyBankLimit: 1,
  bankConnectionsUsed: 0,
  bankConnectionsRemaining: 1,
});

export function EntitlementsProvider({ children }) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

  const [entitlements, setEntitlements] = useState(FREE_DEFAULTS);
  const [loading, setLoading] = useState(true);

  const getToken = useCallback(async () => {
    if (isDevMode) return getUserToken();
    return await getAccessTokenSilently({ audience: import.meta.env.VITE_AUTH0_AUDIENCE });
  }, [isDevMode, getAccessTokenSilently]);

  const fetchEntitlements = useCallback(async () => {
    if (!isDevMode && !isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/entitlements`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setEntitlements(data);
      } else {
        console.error('[Entitlements] Failed to fetch:', res.status);
      }
    } catch (err) {
      console.error('[Entitlements] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isDevMode, getToken]);

  // Load entitlements on mount / auth change
  useEffect(() => {
    fetchEntitlements();
  }, [fetchEntitlements]);

  // Change plan (calls backend, then refreshes entitlements)
  const changePlan = useCallback(async (newPlan) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/subscription/change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: newPlan }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update entitlements immediately from the response
        const { ok, previousPlan, ...ent } = data;
        setEntitlements(ent);
        return { ok: true, previousPlan };
      } else {
        const err = await res.json();
        return { ok: false, error: err };
      }
    } catch (err) {
      console.error('[Entitlements] Plan change error:', err.message);
      return { ok: false, error: err.message };
    }
  }, [getToken]);

  const value = useMemo(() => ({
    ...entitlements,
    loading,
    changePlan,
    refreshEntitlements: fetchEntitlements,
  }), [entitlements, loading, changePlan, fetchEntitlements]);

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

/**
 * useEntitlements() — the primary hook for UI gating.
 *
 * Usage:
 *   const { canExport, canUseLLM, plan, bankConnectionsRemaining } = useEntitlements();
 *   if (!canExport) showUpgradePrompt('export');
 */
export function useEntitlements() {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error('useEntitlements must be used inside EntitlementsProvider');
  return ctx;
}
