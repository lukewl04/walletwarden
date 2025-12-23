import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeTransaction, generateId } from '../models/transaction';

const STORAGE_KEY = 'walletwarden:transactions:v1';
const TransactionsContext = createContext(null);

export function TransactionsProvider({ children }) {
  const [transactions, setTransactions] = useState([]);

  // Load from localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setTransactions(parsed);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    } catch (e) {
      // ignore
    }
  }, [transactions]);

  const addTransaction = (tx) => {
    const norm = normalizeTransaction({ ...tx, id: tx.id || generateId() });
    setTransactions((prev) => [norm, ...prev]);
  };

  const bulkAddTransactions = (list) => {
    const norms = (list || []).map((l) => normalizeTransaction({ ...l, id: l.id || generateId() }));
    setTransactions((prev) => [...norms, ...prev]);
  };

  const deleteTransaction = (id) => setTransactions((prev) => prev.filter((t) => t.id !== id));
  const clearTransactions = () => setTransactions([]);

  const totals = useMemo(() => {
    const income = transactions.filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter((t) => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

  return (
    <TransactionsContext.Provider value={{ transactions, addTransaction, bulkAddTransactions, deleteTransaction, clearTransactions, totals }}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error('useTransactions must be used inside TransactionsProvider');
  return ctx;
}