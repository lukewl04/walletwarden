import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeTransaction, generateId } from '../models/transaction';
import { useAuth0 } from '@auth0/auth0-react';
import { getUserToken } from '../utils/userToken';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TransactionsContext = createContext(null);

/**
 * TransactionsProvider - Supabase-only data store
 * All data comes from and goes to Supabase via the backend API.
 * No localStorage caching - always fresh from database.
 */
export function TransactionsProvider({ children }) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

  // Helper to get auth token - uses unique per-browser token in dev mode
  const getToken = async () => {
    if (isDevMode) {
      return getUserToken(); // Generates unique ID per browser
    }
    return await getAccessTokenSilently({ audience: import.meta.env.VITE_AUTH0_AUDIENCE });
  };

  // Load transactions from Supabase on mount
  useEffect(() => {
    let aborted = false;

    const loadTransactions = async () => {
      // Wait for auth in production, or proceed in dev mode
      if (!isDevMode && !isAuthenticated) {
        setLoading(false);
        return;
      }

      try {
        const token = await getToken();
        console.log('[TransactionsContext] Fetching transactions from Supabase...');
        
        const res = await fetch(`${API_BASE}/api/transactions`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!aborted && res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows)) {
            const normalized = rows.map((r) => normalizeTransaction(r));
            const sorted = normalized.sort((a, b) => new Date(b.date) - new Date(a.date));
            setTransactions(sorted);
            console.log('[TransactionsContext] Loaded', sorted.length, 'transactions from Supabase');
          }
        } else if (!res.ok) {
          console.error('[TransactionsContext] Failed to load:', res.status);
        }
      } catch (e) {
        console.error('[TransactionsContext] Error loading transactions:', e.message);
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    loadTransactions();
    return () => { aborted = true; };
  }, [isAuthenticated, isDevMode]);

  // Refresh transactions from Supabase
  const refreshTransactions = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          const normalized = rows.map((r) => normalizeTransaction(r));
          const sorted = normalized.sort((a, b) => new Date(b.date) - new Date(a.date));
          setTransactions(sorted);
          console.log('[TransactionsContext] Refreshed', sorted.length, 'transactions');
        }
      }
    } catch (e) {
      console.error('[TransactionsContext] Refresh failed:', e.message);
    }
  };

  // Add a single transaction
  const addTransaction = async (tx) => {
    const norm = normalizeTransaction({ ...tx, id: tx.id || generateId() });
    
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(norm),
      });
      
      if (res.ok) {
        // Add to local state after successful save
        setTransactions((prev) => [norm, ...prev]);
      } else {
        console.error('Failed to add transaction:', res.status);
      }
    } catch (e) {
      console.error('Failed to add transaction:', e.message);
    }
  };

  // Bulk add transactions
  const bulkAddTransactions = async (list) => {
    const norms = (list || []).map((l) => normalizeTransaction({ ...l, id: l.id || generateId() }));
    
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/transactions/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(norms),
      });
      
      if (res.ok) {
        // Refresh from server to get accurate state
        await refreshTransactions();
      } else {
        console.error('Failed to bulk add transactions:', res.status);
      }
    } catch (e) {
      console.error('Failed to bulk add transactions:', e.message);
    }
  };

  // Delete a transaction
  const deleteTransaction = async (id) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/transactions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        setTransactions((prev) => prev.filter((t) => t.id !== id));
      } else {
        console.error('Failed to delete transaction:', res.status);
      }
    } catch (e) {
      console.error('Failed to delete transaction:', e.message);
    }
  };

  // Update a transaction
  const updateTransaction = async (id, updates) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/transactions/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...updates, id }),
      });
      
      if (res.ok) {
        setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
      } else {
        console.error('Failed to update transaction:', res.status);
      }
    } catch (e) {
      console.error('Failed to update transaction:', e.message);
    }
  };

  // Clear all transactions - single bulk delete call
  const clearTransactions = async () => {
    try {
      const token = await getToken();
      
      // Bulk delete all transactions from Supabase
      const res = await fetch(`${API_BASE}/api/transactions/clear`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const result = await res.json();
        console.log('[TransactionsContext] Cleared', result.deleted, 'transactions from Supabase');
      } else {
        console.error('Failed to clear transactions:', res.status);
      }
      
      // Clear local state regardless
      setTransactions([]);
    } catch (e) {
      console.error('Failed to clear transactions:', e.message);
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    const income = transactions.filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter((t) => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

  return (
    <TransactionsContext.Provider value={{ 
      transactions, 
      loading,
      addTransaction, 
      bulkAddTransactions, 
      deleteTransaction, 
      updateTransaction, 
      clearTransactions, 
      refreshTransactions, 
      totals 
    }}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error('useTransactions must be used inside TransactionsProvider');
  return ctx;
}