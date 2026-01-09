import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeTransaction, generateId } from '../models/transaction';
import { useAuth0 } from '@auth0/auth0-react';

const STORAGE_KEY = 'walletwarden:transactions:v1';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TransactionsContext = createContext(null);

export function TransactionsProvider({ children }) {
  const { isAuthenticated, getAccessTokenSilently, user } = useAuth0();
  const [transactions, setTransactions] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [localLoaded, setLocalLoaded] = useState(false);

  // Load local cache first (non-blocking)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      console.log('[TransactionsContext] Loading from localStorage:', raw ? `${raw.length} bytes` : 'empty');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTransactions(parsed);
          console.log('[TransactionsContext] Loaded', parsed.length, 'transactions from localStorage');
        }
      }
    } catch (e) {
      console.error('[TransactionsContext] Failed to load from localStorage:', e.message);
    }
    setLocalLoaded(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      const toSave = JSON.stringify(transactions);
      localStorage.setItem(STORAGE_KEY, toSave);
      console.log('[TransactionsContext] Saved', transactions.length, 'transactions to localStorage');
    } catch (e) {
      console.error('[TransactionsContext] Failed to save to localStorage:', e.message);
    }
  }, [transactions]);

  // When authenticated, try to load from backend and merge with local cache (upload local-only items)
  useEffect(() => {
    if (!isAuthenticated || !localLoaded || initialized) return;
    let aborted = false;
    (async () => {
      const maxAttempts = 3;
      let success = false;
      const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

      for (let attempt = 1; attempt <= maxAttempts && !aborted; attempt++) {
        try {
          let token;
          
          if (isDevMode) {
            // In dev mode, use a consistent dummy token (backend uses mock auth)
            // Must match the token used in other files like tracker.jsx
            console.log(`[Attempt ${attempt}] Dev mode - using dummy token`);
            token = localStorage.getItem("walletwarden-token") || 'dev-user';
          } else {
            console.log(`[Attempt ${attempt}] Fetching access token from Auth0...`);
            token = await getAccessTokenSilently({ audience: import.meta.env.VITE_AUTH0_AUDIENCE });
          }

          console.log(`[Attempt ${attempt}] Token ready, fetching transactions from ${API_BASE}/api/transactions`);
          const res = await fetch(`${API_BASE}/api/transactions`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          console.log(`[Attempt ${attempt}] Response status: ${res.status}`);
          
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.warn(`[Attempt ${attempt}] Backend returned ${res.status}:`, errData);
            // If 401, the JWT is invalid - no point retrying
            if (res.status === 401) {
              throw new Error(`Auth error (${errData.message || 'jwt invalid'}): Check your Auth0 configuration`);
            }
            throw new Error(`fetch_failed: ${res.status} ${JSON.stringify(errData)}`);
          }
          
          const rows = await res.json();
          if (!aborted && Array.isArray(rows)) {
            console.log(`[Attempt ${attempt}] Successfully loaded ${rows.length} transactions from backend`);
            // Load current local state to merge
            let local = [];
            try {
              const raw = localStorage.getItem(STORAGE_KEY);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) local = parsed.map((l) => normalizeTransaction(l));
              }
            } catch (e) {
              console.warn('Failed to load local cache:', e.message);
            }

            const backend = rows.map((r) => normalizeTransaction(r));
            const map = new Map();
            backend.forEach((b) => map.set(b.id, b));

            const toUpload = [];
            local.forEach((l) => {
              if (!map.has(l.id)) {
                map.set(l.id, l);
                toUpload.push(l);
              } else {
                // prefer local copy for any differing fields
                map.set(l.id, { ...map.get(l.id), ...l });
              }
            });

            const merged = Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));

            setTransactions(merged);
            console.log(`[Attempt ${attempt}] Merged ${merged.length} total transactions (${toUpload.length} to upload)`);

            if (toUpload.length > 0) {
              try {
                console.log(`[Attempt ${attempt}] Uploading ${toUpload.length} local-only transactions to backend`);
                const uploadRes = await fetch(`${API_BASE}/api/transactions/bulk`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify(toUpload),
                });
                if (uploadRes.ok) {
                  const uploadData = await uploadRes.json();
                  console.log(`[Attempt ${attempt}] Successfully uploaded ${uploadData.inserted || toUpload.length} transactions`);
                } else {
                  console.warn(`[Attempt ${attempt}] Upload failed with status ${uploadRes.status}`);
                }
              } catch (e) {
                console.warn('Failed to upload local transactions to backend', e.message);
              }
            }
          }

          success = true;
          setInitialized(true);
          break;
        } catch (e) {
          // keep local cache if backend fails
          console.warn(`[Attempt ${attempt}/${maxAttempts}] Failed to fetch/sync transactions:`, e.message);
          if (attempt < maxAttempts && !e.message.includes('Auth error')) {
            // simple backoff, but don't retry if it's an auth error
            await new Promise((r) => setTimeout(r, 500 * attempt));
          } else if (e.message.includes('Auth error')) {
            // Auth error - stop retrying and use local cache
            console.error('Auth error detected - stopping retries and using local cache');
            setInitialized(true);
            return;
          }
        }
      }

      if (!success && !aborted) {
        // final fallback: mark initialized so UI can proceed with local cache, but leave logs for debugging
        console.warn('Failed to fetch backend transactions after multiple attempts; using local cache');
        setInitialized(true);
      }
    })();
    return () => { aborted = true; };
  }, [isAuthenticated, getAccessTokenSilently, initialized, localLoaded]);

  const addTransaction = async (tx) => {
    const norm = normalizeTransaction({ ...tx, id: tx.id || generateId() });
    setTransactions((prev) => [norm, ...prev]);

    const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';
    if (!isAuthenticated && !isDevMode) return;
    try {
      const token = isDevMode ? (localStorage.getItem('walletwarden-token') || 'dev-user') : await getAccessTokenSilently({ audience: import.meta.env.VITE_AUTH0_AUDIENCE });
      const res = await fetch(`${API_BASE}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(norm),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn('Backend rejected transaction:', res.status, errData);
      }
    } catch (e) {
      console.warn('Failed to persist transaction to API, kept local copy', e);
    }
  };

  const bulkAddTransactions = async (list) => {
    const norms = (list || []).map((l) => normalizeTransaction({ ...l, id: l.id || generateId() }));
    setTransactions((prev) => [...norms, ...prev]);

    const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';
    if (!isAuthenticated && !isDevMode) return;
    try {
      const token = isDevMode ? (localStorage.getItem('walletwarden-token') || 'dev-user') : await getAccessTokenSilently({ audience: import.meta.env.VITE_AUTH0_AUDIENCE });
      await fetch(`${API_BASE}/api/transactions/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(norms),
      });
    } catch (e) {
      console.warn('Failed to persist bulk transactions to API, kept local copy', e);
    }
  };

  const deleteTransaction = async (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';
    if (!isAuthenticated && !isDevMode) return;
    try {
      const token = isDevMode ? (localStorage.getItem('walletwarden-token') || 'dev-user') : await getAccessTokenSilently({ audience: import.meta.env.VITE_AUTH0_AUDIENCE });
      await fetch(`${API_BASE}/api/transactions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.warn('Failed to delete from backend, local copy removed', e);
    }
  };

  const updateTransaction = async (id, updates) => {
    const updated = { ...updates, id };
    setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
    const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';
    if (!isAuthenticated && !isDevMode) return;
    try {
      const token = isDevMode ? (localStorage.getItem('walletwarden-token') || 'dev-user') : await getAccessTokenSilently({ audience: import.meta.env.VITE_AUTH0_AUDIENCE });
      await fetch(`${API_BASE}/api/transactions/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.warn('Failed to update transaction on backend, local copy updated', e);
    }
  };

  const clearTransactions = async () => {
    const currentTransactions = transactions;
    setTransactions([]);
    
    const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';
    if (!isAuthenticated && !isDevMode) return;
    
    try {
      const token = isDevMode ? (localStorage.getItem('walletwarden-token') || 'dev-user') : await getAccessTokenSilently({ audience: import.meta.env.VITE_AUTH0_AUDIENCE });
      
      // Delete each transaction from the backend
      for (const transaction of currentTransactions) {
        try {
          await fetch(`${API_BASE}/api/transactions/${encodeURIComponent(transaction.id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (e) {
          console.warn(`Failed to delete transaction ${transaction.id} from backend:`, e.message);
        }
      }
      console.log(`Successfully cleared all ${currentTransactions.length} transactions from backend`);
    } catch (e) {
      console.warn('Failed to clear transactions from backend:', e);
    }
  };

  const totals = useMemo(() => {
    const income = transactions.filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter((t) => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

  return (
    <TransactionsContext.Provider value={{ transactions, addTransaction, bulkAddTransactions, deleteTransaction, updateTransaction, clearTransactions, totals }}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error('useTransactions must be used inside TransactionsProvider');
  return ctx;
}