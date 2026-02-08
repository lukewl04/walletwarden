// npm i framer-motion
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import Navbar from "../components/navbar.jsx";
import CsvPdfUpload from "../components/csv-pdf-upload.jsx";
import { useTransactions } from "../state/TransactionsContext";
import { generateId } from "../models/transaction";
import { getUserToken } from "../utils/userToken";
import { suggestCategory } from "../utils/categories";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import "./tracker.css";

// Extracted components
import TrackerHeader from "../components/tracker/TrackerHeader.jsx";
import PeriodNavigation from "../components/tracker/PeriodNavigation.jsx";
import SummaryCard from "../components/tracker/SummaryCard.jsx";
import IncomeCard from "../components/tracker/IncomeCard.jsx";
import PurchasesPivotTable from "../components/tracker/PurchasesPivotTable.jsx";
import AddPurchaseModal from "../components/tracker/AddPurchaseModal.jsx";
import ImportModal from "../components/tracker/ImportModal.jsx";
import ExpectedIncomeModal from "../components/tracker/ExpectedIncomeModal.jsx";

const API_URL = "http://localhost:4000/api";

// Helper to get auth headers with unique user token
const getAuthHeaders = () => ({ Authorization: `Bearer ${getUserToken()}` });

// Keep dates as day-only strings to avoid timezone shifts
const formatDateParts = (year, month, day) => {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const toDateOnlyString = (value) => {
  if (!value) {
    const now = new Date();
    return formatDateParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  if (typeof value === "string") {
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return formatDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

    const ukMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ukMatch) return formatDateParts(Number(ukMatch[3]), Number(ukMatch[2]), Number(ukMatch[1]));
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return formatDateParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  return formatDateParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

const toLocalDate = (value) => {
  const safe = toDateOnlyString(value);
  const [y, m, d] = safe.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const sanitizeIncome = (entry) => {
  if (!entry) return null;
  const amount = Math.abs(Number(entry.amount) || 0);
  const date = toDateOnlyString(entry.date);
  const split_id = entry.split_id;
  if (!split_id) return null;
  return {
    id: entry.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    split_id,
    transaction_id: entry.transaction_id || null,
    date,
    amount,
    category: entry.category || "Income",
    description: (entry.description || "").toString().trim(),
    type: "income",
  };
};

export default function Tracker() {
  const { addTransaction, bulkAddTransactions, updateTransaction, transactions: globalTransactions = [] } =
    useTransactions?.() ?? {};

  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  const [savedSplits, setSavedSplits] = useState([]);
  const [selectedSplit, setSelectedSplit] = useState(null);
  const [viewMode, setViewMode] = useState("weekly"); // "weekly", "monthly", or "yearly"
  const [currentDate, setCurrentDate] = useState(new Date());
  const [purchases, setPurchases] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newPurchase, setNewPurchase] = useState(() => ({
    date: toDateOnlyString(new Date()),
    amount: "",
    category: "",
    description: "",
  }));
  const [showImportModal, setShowImportModal] = useState(false);
  const [categoryRules, setCategoryRules] = useState({}); // description -> category
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [splitIncomes, setSplitIncomes] = useState([]);
  const [incomeSettings, setIncomeSettings] = useState([]);
  const [showExpectedIncomeModal, setShowExpectedIncomeModal] = useState(false);
  const [expectedIncomeForm, setExpectedIncomeForm] = useState({
    expected_amount: "",
    next_payday: "",
    frequency: "monthly",
    use_expected_when_no_actual: true,
  });

  const splitIncomesLoaded = useRef(false);
  const categoryRulesLoaded = useRef(false);
  const incomeSettingsLoaded = useRef(false);
  const dataLoadedFromBackend = useRef(false);
  const purchasesLoadedFromBackend = useRef(false);
  const incomesLoadedFromBackend = useRef(false);
  const syncSplitsTimeoutRef = useRef(null);
  const syncPurchasesTimeoutRef = useRef(null);
  const syncIncomesTimeoutRef = useRef(null);
  
  // Track dirty items to only sync what changed (not everything)
  const dirtyPurchaseIds = useRef(new Set());
  const dirtyIncomeIds = useRef(new Set());
  const syncedPurchaseIds = useRef(new Set()); // Track what's already in backend

  // Restore selected split from navigation state or localStorage on mount
  useEffect(() => {
    // Priority: navigation state > localStorage
    const fromNavigation = location.state?.selectedSplitId;
    if (fromNavigation && !selectedSplit) {
      setSelectedSplit(fromNavigation);
      return;
    }
    const saved = localStorage.getItem("walletwardenSelectedSplit");
    if (saved && !selectedSplit) setSelectedSplit(saved);
  }, [location.state]);

  // Persist selected split to localStorage
  useEffect(() => {
    if (selectedSplit) localStorage.setItem("walletwardenSelectedSplit", selectedSplit);
  }, [selectedSplit]);

  const selectedSplitData = useMemo(
    () => savedSplits.find((s) => s.id === selectedSplit),
    [selectedSplit, savedSplits]
  );

  // Load persisted category rules
  useEffect(() => {
    try {
      const raw = localStorage.getItem("walletwardenCategoryRules");
      if (raw) setCategoryRules(JSON.parse(raw));
    } catch (e) {
      console.warn("Failed to load category rules", e);
    } finally {
      categoryRulesLoaded.current = true;
    }
  }, []);

  // Persist category rules
  useEffect(() => {
    if (!categoryRulesLoaded.current) return;
    try {
      localStorage.setItem("walletwardenCategoryRules", JSON.stringify(categoryRules));
    } catch (e) {
      console.warn("Failed to save category rules", e);
    }
  }, [categoryRules]);

  // Load persisted split incomes from localStorage (backup only)
  useEffect(() => {
    if (incomesLoadedFromBackend.current) {
      splitIncomesLoaded.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem("walletwardenSplitIncomes");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map(sanitizeIncome).filter(Boolean);
          setSplitIncomes(sanitized);
        }
      }
    } catch (e) {
      console.warn("Failed to load split incomes", e);
    } finally {
      splitIncomesLoaded.current = true;
    }
  }, []);

  // Persist split incomes to localStorage and sync to backend (debounced, batch)
  useEffect(() => {
    if (!splitIncomesLoaded.current) return;

    try {
      localStorage.setItem("walletwardenSplitIncomes", JSON.stringify(splitIncomes));
    } catch (e) {
      console.warn("Failed to save split incomes", e);
    }

    if (!isLoading && incomesLoadedFromBackend.current) {
      if (syncIncomesTimeoutRef.current) {
        clearTimeout(syncIncomesTimeoutRef.current);
      }
      
      syncIncomesTimeoutRef.current = setTimeout(async () => {
        // Only sync dirty incomes
        const toSync = splitIncomes.filter(i => 
          i.split_id && dirtyIncomeIds.current.has(i.id)
        );
        
        if (toSync.length === 0) return;
        
        try {
          // Use batch endpoint
          const response = await fetch(`${API_URL}/purchases/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({
              purchases: toSync.map(income => ({
                id: income.id,
                split_id: income.split_id,
                transaction_id: income.transaction_id,
                date: income.date,
                amount: income.amount,
                category: income.category || "Income",
                description: income.description,
              }))
            }),
          });
          
          if (response.ok) {
            toSync.forEach(i => dirtyIncomeIds.current.delete(i.id));
            console.log(`[Tracker] Batch synced ${toSync.length} incomes`);
          }
        } catch (err) {
          console.error("Error syncing incomes to backend:", err);
        }
      }, 2000);
    }
    
    return () => {
      if (syncIncomesTimeoutRef.current) {
        clearTimeout(syncIncomesTimeoutRef.current);
      }
    };
  }, [splitIncomes, isLoading]);

  // Load from backend and auto-import unlinked transactions
  useEffect(() => {
    const loadDataFromBackend = async () => {
      // Load from localStorage first for instant UI (optimistic loading)
      const cachedSplits = localStorage.getItem("walletwardenSplits");
      const cachedSelectedSplit = localStorage.getItem("walletwardenSelectedSplit");
      
      if (cachedSplits) {
        try {
          const parsed = JSON.parse(cachedSplits);
          setSavedSplits(parsed);
          if (cachedSelectedSplit && parsed.some((s) => s.id === cachedSelectedSplit)) {
            setSelectedSplit(cachedSelectedSplit);
          } else if (parsed.length > 0) {
            setSelectedSplit(parsed[0].id);
          }
        } catch (e) {
          console.warn("Failed to parse cached splits", e);
        }
      }

      try {
        // Fetch all data in PARALLEL for much faster loading
        const [splitsResult, purchasesResult, incomeSettingsResult] = await Promise.allSettled([
          fetch(`${API_URL}/splits`, { headers: { ...getAuthHeaders() } }),
          fetch(`${API_URL}/purchases`, { headers: { ...getAuthHeaders() } }),
          fetch(`${API_URL}/income-settings`, { headers: { ...getAuthHeaders() } }),
        ]);

        let loadedSplits = [];
        let selectedSplitId = null;
        let selectedSplitData = null;

        // Process splits
        if (splitsResult.status === "fulfilled" && splitsResult.value.ok) {
          loadedSplits = await splitsResult.value.json();
          console.log("[Tracker] Loaded splits from backend:", loadedSplits.length);
          
          // Merge with local splits
          const localSplits = localStorage.getItem("walletwardenSplits");
          if (localSplits) {
            const parsedLocal = JSON.parse(localSplits);
            for (const localSplit of parsedLocal) {
              if (!loadedSplits.some((s) => s.id === localSplit.id)) loadedSplits.push(localSplit);
            }
          }
          
          setSavedSplits(loadedSplits);
          localStorage.setItem("walletwardenSplits", JSON.stringify(loadedSplits));

          const savedSplitId = localStorage.getItem("walletwardenSelectedSplit");
          if (savedSplitId && loadedSplits.some((s) => s.id === savedSplitId)) {
            selectedSplitId = savedSplitId;
            selectedSplitData = loadedSplits.find((s) => s.id === savedSplitId);
            setSelectedSplit(savedSplitId);
          } else if (loadedSplits.length > 0 && !selectedSplit) {
            selectedSplitId = loadedSplits[0].id;
            selectedSplitData = loadedSplits[0];
            setSelectedSplit(loadedSplits[0].id);
          }
        }

        // Process purchases
        if (purchasesResult.status === "fulfilled" && purchasesResult.value.ok) {
          const allPurchases = await purchasesResult.value.json();
          console.log("[Tracker] Loaded purchases from backend:", allPurchases.length);

          // Deduplicate purchases by ID AND by transaction_id (in case of sync issues)
          const seenIds = new Set();
          const seenTransactionIds = new Set();
          const uniquePurchases = [];
          let duplicateCount = 0;
          for (const p of allPurchases) {
            // Skip if we've seen this purchase ID
            if (seenIds.has(p.id)) {
              duplicateCount++;
              continue;
            }
            // Skip if we've seen this transaction_id (prevents duplicates from multiple imports)
            if (p.transaction_id && seenTransactionIds.has(p.transaction_id)) {
              duplicateCount++;
              continue;
            }
            
            seenIds.add(p.id);
            if (p.transaction_id) seenTransactionIds.add(p.transaction_id);
            uniquePurchases.push(p);
          }
          
          console.log(`[Tracker] Deduplicated ${allPurchases.length} -> ${uniquePurchases.length} purchases (${duplicateCount} duplicates filtered)`);
          
          // If we found duplicates, clean them up in the backend too
          if (duplicateCount > 0) {
            console.log("[Tracker] Cleaning up duplicates in backend...");
            fetch(`${API_URL}/purchases/deduplicate`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            }).then(res => res.json())
              .then(data => console.log("[Tracker] Backend dedup result:", data))
              .catch(err => console.error("[Tracker] Backend dedup error:", err));
          }

          // Use a single pass to separate income and expenses (more efficient)
          const incomePurchases = [];
          const expensePurchases = [];
          for (const p of uniquePurchases) {
            const catLower = (p.category || "").toLowerCase();
            if (catLower === "income") {
              incomePurchases.push(p);
            } else {
              expensePurchases.push(p);
            }
          }

          purchasesLoadedFromBackend.current = true;
          setPurchases(expensePurchases);

          if (incomePurchases.length > 0) {
            const loadedIncomes = incomePurchases
              .map((p) =>
                sanitizeIncome({
                  id: p.id,
                  split_id: p.split_id,
                  transaction_id: p.transaction_id,
                  date: p.date,
                  amount: p.amount,
                  category: p.category || "Income",
                  description: p.description,
                  type: "income",
                })
              )
              .filter(Boolean);

            incomesLoadedFromBackend.current = true;
            setSplitIncomes(loadedIncomes);
          } else {
            incomesLoadedFromBackend.current = true;
          }
        } else {
          purchasesLoadedFromBackend.current = true;
          incomesLoadedFromBackend.current = true;
        }

        // Process income settings
        if (incomeSettingsResult.status === "fulfilled" && incomeSettingsResult.value.ok) {
          const allIncomeSettings = await incomeSettingsResult.value.json();
          console.log("[Tracker] Loaded income settings from backend:", allIncomeSettings.length);
          setIncomeSettings(allIncomeSettings);
          incomeSettingsLoaded.current = true;
        }

        dataLoadedFromBackend.current = true;
        setIsLoading(false);
        
        // DISABLED: Auto-import was causing massive duplication issues (415k+ duplicates)
        // Transactions from Warden Insights should be imported manually via the Import button
        // if (selectedSplitId && selectedSplitData) {
        //   const runAutoImport = () => {
        //     console.log("[Tracker] Starting deferred auto-import from Warden Insights...");
        //     autoImportFromWardenInsights(selectedSplitId, selectedSplitData);
        //   };
        //   
        //   if (typeof requestIdleCallback === "function") {
        //     requestIdleCallback(runAutoImport, { timeout: 3000 });
        //   } else {
        //     setTimeout(runAutoImport, 100);
        //   }
        // }
      } catch (err) {
        console.error("Error loading data from backend:", err);

        const localSplits = localStorage.getItem("walletwardenSplits");
        if (localSplits) {
          const splits = JSON.parse(localSplits);
          setSavedSplits(splits);
          const savedSplitId = localStorage.getItem("walletwardenSelectedSplit");
          if (savedSplitId && splits.some((s) => s.id === savedSplitId)) setSelectedSplit(savedSplitId);
          else if (splits.length > 0) setSelectedSplit(splits[0].id);
        }

        dataLoadedFromBackend.current = true;
        setIsLoading(false);
      }
    };

    loadDataFromBackend();
  }, []);

  // Handler to update a split (name and categories)
  const handleUpdateSplit = useCallback(async (updatedSplit) => {
    if (!updatedSplit?.id) return;
    
    try {
      // Update in backend
      const response = await fetch(`${API_URL}/splits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          id: updatedSplit.id,
          name: updatedSplit.name,
          frequency: updatedSplit.frequency || "custom",
          categories: updatedSplit.categories,
        }),
      });

      if (response.ok) {
        // Update local state
        setSavedSplits((prev) =>
          prev.map((s) => (s.id === updatedSplit.id ? updatedSplit : s))
        );
        // Update localStorage
        const current = JSON.parse(localStorage.getItem("walletwardenSplits") || "[]");
        const updated = current.map((s) => (s.id === updatedSplit.id ? updatedSplit : s));
        localStorage.setItem("walletwardenSplits", JSON.stringify(updated));
        console.log("[Tracker] Split updated:", updatedSplit.name);
      } else {
        console.error("[Tracker] Failed to update split:", response.status);
      }
    } catch (err) {
      console.error("[Tracker] Error updating split:", err);
    }
  }, []);

  // Handler to delete a split
  const handleDeleteSplit = useCallback(async (splitId) => {
    if (!splitId) return;
    
    // Prevent deleting the only split
    if (savedSplits.length <= 1) {
      console.warn("[Tracker] Cannot delete the only split");
      return;
    }

    try {
      // Delete from backend
      const response = await fetch(`${API_URL}/splits/${encodeURIComponent(splitId)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        // Find a new split to select
        const remainingSplits = savedSplits.filter((s) => s.id !== splitId);
        const newSelectedId = remainingSplits.length > 0 ? remainingSplits[0].id : null;

        // Update local state
        setSavedSplits(remainingSplits);
        if (newSelectedId) {
          setSelectedSplit(newSelectedId);
          localStorage.setItem("walletwardenSelectedSplit", newSelectedId);
        }

        // Update localStorage
        localStorage.setItem("walletwardenSplits", JSON.stringify(remainingSplits));
        console.log("[Tracker] Split deleted, switched to:", newSelectedId);
      } else {
        console.error("[Tracker] Failed to delete split:", response.status);
      }
    } catch (err) {
      console.error("[Tracker] Error deleting split:", err);
    }
  }, [savedSplits]);


  // Normalize transactions (Warden Insights) - with stable reference
  const normalizedTransactions = useMemo(() => {
    if (!Array.isArray(globalTransactions)) return [];
    return globalTransactions.map((t) => {
      const rawType = (t?.type || "").toString().trim().toLowerCase();
      const amount = Number(t?.amount) || 0;
      const type = rawType === "income" ? "income" : "expense";
      const description = (t?.description || "").toString().trim();
      return { ...t, type, amount, description };
    });
  }, [globalTransactions]);

  // Pre-index purchases by split_id for O(1) lookup
  const purchasesBySplit = useMemo(() => {
    const map = new Map();
    for (const p of purchases) {
      if (!p.split_id) continue;
      if (!map.has(p.split_id)) map.set(p.split_id, []);
      map.get(p.split_id).push(p);
    }
    return map;
  }, [purchases]);

  // Pre-index incomes by split_id for O(1) lookup
  const incomesBySplit = useMemo(() => {
    const map = new Map();
    for (const i of splitIncomes) {
      const sanitized = sanitizeIncome(i);
      if (!sanitized || !sanitized.split_id || (Number(sanitized.amount) || 0) <= 0) continue;
      if (!map.has(sanitized.split_id)) map.set(sanitized.split_id, []);
      map.get(sanitized.split_id).push(sanitized);
    }
    return map;
  }, [splitIncomes]);

  // All purchases (no longer filtered by split - splits only define categories/budgets)
  const filteredPurchases = useMemo(() => {
    return purchases;
  }, [purchases]);

  // All incomes (no longer filtered by split)
  const filteredIncomes = useMemo(() => {
    return splitIncomes.map(sanitizeIncome).filter(Boolean);
  }, [splitIncomes]);

  const incomeTransactions = useMemo(() => filteredIncomes, [filteredIncomes]);

  // Week helpers
  const getWeekStart = useCallback((date) => {
    const d = toLocalDate(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday start
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
  }, []);

  const getWeekEnd = useCallback(
    (date) => {
      const start = getWeekStart(date);
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    },
    [getWeekStart]
  );

  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate, getWeekStart]);
  const weekEnd = useMemo(() => getWeekEnd(currentDate), [currentDate, getWeekEnd]);

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const previousWeek = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
  };
  const nextWeek = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
  };
  const goToCurrentWeek = () => setCurrentDate(new Date());

  // Month helpers
  const getMonthStart = useCallback((date) => {
    const d = toLocalDate(date);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);
  const getMonthEnd = useCallback((date) => {
    const d = toLocalDate(date);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }, []);
  const monthStart = useMemo(() => getMonthStart(currentDate), [currentDate, getMonthStart]);
  const monthEnd = useMemo(() => getMonthEnd(currentDate), [currentDate, getMonthEnd]);

  const previousMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const goToCurrentMonth = () => setCurrentDate(new Date());

  // Year helpers
  const getYearStart = useCallback((date) => {
    const d = toLocalDate(date);
    return new Date(d.getFullYear(), 0, 1);
  }, []);
  const getYearEnd = useCallback((date) => {
    const d = toLocalDate(date);
    return new Date(d.getFullYear(), 11, 31);
  }, []);
  const yearStart = useMemo(() => getYearStart(currentDate), [currentDate, getYearStart]);
  const yearEnd = useMemo(() => getYearEnd(currentDate), [currentDate, getYearEnd]);

  const previousYear = () => setCurrentDate(new Date(currentDate.getFullYear() - 1, 0, 1));
  const nextYear = () => setCurrentDate(new Date(currentDate.getFullYear() + 1, 0, 1));
  const goToCurrentYear = () => setCurrentDate(new Date());

  // Weeks in month (for monthly view row labels)
  const monthWeeks = useMemo(() => {
    const weeks = [];
    const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

    let currentWeekStart = getWeekStart(firstDay);
    let weekNum = 1;

    while (currentWeekStart <= lastDay) {
      const wEnd = new Date(
        currentWeekStart.getFullYear(),
        currentWeekStart.getMonth(),
        currentWeekStart.getDate() + 6
      );
      weeks.push({
        num: weekNum,
        start: new Date(currentWeekStart),
        end: wEnd,
        label: `Week ${weekNum}`,
      });
      currentWeekStart = new Date(
        currentWeekStart.getFullYear(),
        currentWeekStart.getMonth(),
        currentWeekStart.getDate() + 7
      );
      weekNum++;
    }
    return weeks;
  }, [monthStart, getWeekStart]);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Period bounds based on split frequency (budgeting)
  const periodBounds = useMemo(() => {
    if (!selectedSplitData) return { start: null, end: null, frequency: null };
    const freq = selectedSplitData.frequency;
    const base = toLocalDate(currentDate);

    if (freq === "weekly") {
      const start = getWeekStart(base);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { start, end, frequency: freq };
    }
    if (freq === "monthly") {
      const start = new Date(base.getFullYear(), base.getMonth(), 1);
      const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      return { start, end, frequency: freq };
    }
    if (freq === "yearly") {
      const start = new Date(base.getFullYear(), 0, 1);
      const end = new Date(base.getFullYear(), 11, 31);
      return { start, end, frequency: freq };
    }
    return { start: null, end: null, frequency: freq };
  }, [selectedSplitData, currentDate, getWeekStart]);

  const isInCurrentPeriod = useCallback(
    (dateValue) => {
      if (!periodBounds.start || !periodBounds.end) return true;
      const d = toLocalDate(dateValue);
      return d >= periodBounds.start && d <= periodBounds.end;
    },
    [periodBounds]
  );

  // Income filtered by viewMode (for Income card)
  const weekIncomeTransactions = useMemo(() => {
    if (!selectedSplit) return [];
    return incomeTransactions.filter((tx) => {
      const txDate = toLocalDate(tx.date);
      return txDate >= weekStart && txDate <= weekEnd;
    });
  }, [incomeTransactions, selectedSplit, weekStart, weekEnd]);

  const monthIncomeTransactions = useMemo(() => {
    if (!selectedSplit) return [];
    return incomeTransactions.filter((tx) => {
      const txDate = toLocalDate(tx.date);
      return txDate >= monthStart && txDate <= monthEnd;
    });
  }, [incomeTransactions, selectedSplit, monthStart, monthEnd]);

  const yearIncomeTransactions = useMemo(() => {
    if (!selectedSplit) return [];
    return incomeTransactions.filter((tx) => {
      const txDate = toLocalDate(tx.date);
      return txDate >= yearStart && txDate <= yearEnd;
    });
  }, [incomeTransactions, selectedSplit, yearStart, yearEnd]);

  const viewIncomeTransactions = useMemo(() => {
    if (viewMode === "yearly") return yearIncomeTransactions;
    if (viewMode === "monthly") return monthIncomeTransactions;
    return weekIncomeTransactions;
  }, [viewMode, yearIncomeTransactions, monthIncomeTransactions, weekIncomeTransactions]);

  // Income filtered by split period (weekly/monthly/yearly) for budget calculations
  const periodIncomeTransactions = useMemo(() => {
    if (!selectedSplit) return [];
    if (periodBounds.start && periodBounds.end) {
      return incomeTransactions.filter((tx) => {
        const txDate = toLocalDate(tx.date);
        return txDate >= periodBounds.start && txDate <= periodBounds.end;
      });
    }
    return incomeTransactions;
  }, [incomeTransactions, selectedSplit, periodBounds]);

  const periodIncomeTotal = useMemo(() => {
    return periodIncomeTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }, [periodIncomeTransactions]);

  const selectedIncomeSettings = useMemo(() => {
    if (!selectedSplit) return null;
    return incomeSettings.find((s) => s.split_id === selectedSplit) || null;
  }, [incomeSettings, selectedSplit]);

  const budgetIncomeTotal = useMemo(() => {
    if (periodIncomeTotal > 0) return periodIncomeTotal;
    if (
      selectedIncomeSettings &&
      selectedIncomeSettings.use_expected_when_no_actual &&
      selectedIncomeSettings.expected_amount > 0
    ) {
      return selectedIncomeSettings.expected_amount;
    }
    return 0;
  }, [periodIncomeTotal, selectedIncomeSettings]);

  const isUsingExpectedIncome = useMemo(() => {
    return (
      periodIncomeTotal === 0 &&
      selectedIncomeSettings &&
      selectedIncomeSettings.use_expected_when_no_actual &&
      selectedIncomeSettings.expected_amount > 0
    );
  }, [periodIncomeTotal, selectedIncomeSettings]);



  // Sync splits (debounced to reduce API calls)
  useEffect(() => {
    if (isLoading || !dataLoadedFromBackend.current) return;
    
    if (syncSplitsTimeoutRef.current) {
      clearTimeout(syncSplitsTimeoutRef.current);
    }
    
    syncSplitsTimeoutRef.current = setTimeout(async () => {
      if (savedSplits.length === 0) return;
      try {
        for (const split of savedSplits) {
          await fetch(`${API_URL}/splits`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({
              id: split.id,
              name: split.name,
              frequency: split.frequency,
              categories: split.categories,
            }),
          });
        }
      } catch (err) {
        console.error("Error syncing splits:", err);
      }
    }, 1000);
    
    return () => {
      if (syncSplitsTimeoutRef.current) {
        clearTimeout(syncSplitsTimeoutRef.current);
      }
    };
  }, [savedSplits, isLoading]);

  // Sync purchases (debounced, batch, only dirty items)
  useEffect(() => {
    if (isLoading || !purchasesLoadedFromBackend.current) return;
    
    if (syncPurchasesTimeoutRef.current) {
      clearTimeout(syncPurchasesTimeoutRef.current);
    }
    
    syncPurchasesTimeoutRef.current = setTimeout(async () => {
      // Only sync items that are dirty (new or modified)
      const toSync = purchases.filter(p => 
        p.split_id && dirtyPurchaseIds.current.has(p.id)
      );
      
      if (toSync.length === 0) return;
      
      try {
        // Use batch endpoint for much better performance
        const response = await fetch(`${API_URL}/purchases/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            purchases: toSync.map(p => ({
              id: p.id,
              split_id: p.split_id,
              transaction_id: p.transaction_id,
              date: p.date,
              amount: p.amount,
              category: p.category,
              description: p.description,
            }))
          }),
        });
        
        if (response.ok) {
          // Clear dirty flags for synced items
          toSync.forEach(p => {
            dirtyPurchaseIds.current.delete(p.id);
            syncedPurchaseIds.current.add(p.id);
          });
          console.log(`[Tracker] Batch synced ${toSync.length} purchases`);
        }
      } catch (err) {
        console.error("Error syncing purchases:", err);
      }
    }, 2000); // Increased debounce to 2 seconds for better batching
    
    return () => {
      if (syncPurchasesTimeoutRef.current) {
        clearTimeout(syncPurchasesTimeoutRef.current);
      }
    };
  }, [purchases, isLoading]);

  // Add purchase
  const handleAddPurchase = () => {
    if (!newPurchase.amount || !newPurchase.category) {
      alert("Please fill in amount and category");
      return;
    }

    const transactionId = generateId();
    const purchaseDate = toDateOnlyString(newPurchase.date);
    const purchase = {
      id: crypto.randomUUID(),
      split_id: selectedSplit,
      transaction_id: transactionId,
      ...newPurchase,
      date: purchaseDate,
      amount: parseFloat(newPurchase.amount),
    };

    // Mark as dirty for sync
    dirtyPurchaseIds.current.add(purchase.id);
    setPurchases([...purchases, purchase]);

    if (typeof addTransaction === "function") {
      addTransaction({
        id: transactionId,
        type: "expense",
        amount: purchase.amount,
        date: purchaseDate,
        category: purchase.category,
        description: purchase.description,
      });
    }

    setNewPurchase({
      date: toDateOnlyString(new Date()),
      amount: "",
      category: "",
      description: "",
    });
    setShowAddModal(false);
    console.log("[Tracker] Purchase added:", purchase);
  };

  const handleDeletePurchase = async (purchaseId) => {
    if (!confirm("Are you sure you want to delete this purchase?")) return;

    try {
      const response = await fetch(`${API_URL}/purchases/${purchaseId}`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });

      if (response.ok) {
        setPurchases((prev) => prev.filter((p) => p.id !== purchaseId));
      }
    } catch (err) {
      console.error("Error deleting purchase:", err);
      alert("Failed to delete purchase");
    }
  };

  // Normalize a description key for matching rules
  const normalizeDescriptionKey = (desc = "") => desc.toLowerCase().trim().replace(/\s+/g, " ");

  const upsertCategoryRule = (desc, category) => {
    if (!desc || !category) return;
    const key = normalizeDescriptionKey(desc);
    setCategoryRules((prev) => ({ ...prev, [key]: category }));
  };

  const handleUpdatePurchaseCategory = (purchaseId, newCategory) => {
    if (!purchaseId || !newCategory) return;

    // Mark as dirty for sync
    dirtyPurchaseIds.current.add(purchaseId);
    setPurchases((prev) => prev.map((p) => (p.id === purchaseId ? { ...p, category: newCategory } : p)));

    const purchase = purchases.find((p) => p.id === purchaseId);
    if (purchase?.description) upsertCategoryRule(purchase.description, newCategory);

    // Also update the linked global transaction so Warden Insights stays in sync
    if (purchase?.transaction_id && typeof updateTransaction === "function") {
      updateTransaction(purchase.transaction_id, { category: newCategory });
    }

    setEditingPurchaseId(null);
  };

  // Category matching – unified across the app via suggestCategory.
  // Priority: 1) user-defined rules  2) imported category if it matches a split category
  //           3) suggestCategory keyword match against split categories  4) first split cat
  const matchCategory = useCallback((importedCat, description = "") => {
    // 1. User-defined description rules (highest priority)
    const ruleHit = categoryRules[normalizeDescriptionKey(description)];
    if (ruleHit) return ruleHit;

    const splitCats = selectedSplitData?.categories || [];

    // 2. Imported category matches a split category (case-insensitive)
    if (importedCat) {
      const importedLower = importedCat.toLowerCase();
      const exactMatch = splitCats.find((c) => c.name.toLowerCase() === importedLower);
      if (exactMatch) return exactMatch.name;
    }

    // 3. Run the global keyword matcher and check if that category exists in the split
    const suggested = suggestCategory(description);
    if (suggested !== "Other") {
      const suggestedMatch = splitCats.find((c) => c.name.toLowerCase() === suggested.toLowerCase());
      if (suggestedMatch) return suggestedMatch.name;
    }

    // 4. Fallback: first split category
    return splitCats[0]?.name || "Other";
  }, [categoryRules, selectedSplitData]);

  // Bulk add via upload
  const handleBulkAdd = useCallback((transactions) => {
    let withIds = transactions || [];
    if (Array.isArray(withIds)) withIds = withIds.map((t) => ({ ...t, id: t.id || generateId() }));

    if (typeof bulkAddTransactions === "function") bulkAddTransactions(withIds);

    const newPurchases = withIds
      .filter((t) => t.type === "expense")
      .map((t) => {
        const matched = matchCategory(t.category, t.description);
        return {
          id: crypto.randomUUID(),
          split_id: selectedSplit,
          transaction_id: t.id,
          date: toDateOnlyString(t.date),
          amount: Math.abs(Number(t.amount) || 0),
          category: matched,
          description: t.description || "",
        };
      });

    if (newPurchases.length > 0) {
      // Mark all new purchases as dirty for sync
      newPurchases.forEach(p => dirtyPurchaseIds.current.add(p.id));
      setPurchases((prev) => [...prev, ...newPurchases]);

      const mostRecentDate = newPurchases.reduce((latest, p) => {
        const pDate = toLocalDate(p.date);
        return pDate > latest ? pDate : latest;
      }, toLocalDate(newPurchases[0].date));

      setCurrentDate(mostRecentDate);
    }

    setShowImportModal(false);
  }, [matchCategory, bulkAddTransactions, selectedSplit, setShowImportModal]);

  const autoImportFromWardenInsights = async (splitId, splitData) => {
    if (!splitId || !splitData) {
      console.log("[Tracker] Skipping auto-import: no split or split data available");
      return;
    }

    // Fetch the latest purchases from backend to get accurate linked transaction IDs
    // This prevents creating duplicates when the local state is out of sync
    let backendTransactionIds = new Set();
    try {
      const res = await fetch(`${API_URL}/purchases`, { headers: { ...getAuthHeaders() } });
      if (res.ok) {
        const backendPurchases = await res.json();
        backendTransactionIds = new Set(backendPurchases.map((p) => p.transaction_id).filter(Boolean));
        console.log(`[Tracker] Auto-import: Found ${backendTransactionIds.size} existing transaction IDs in backend`);
      }
    } catch (err) {
      console.warn("[Tracker] Auto-import: Could not fetch backend purchases, using local state", err);
    }

    // Combine backend IDs with local state IDs for complete coverage
    const linkedTransactionIds = new Set([
      ...backendTransactionIds,
      ...purchases.map((p) => p.transaction_id).filter(Boolean)
    ]);
    
    const linkedIncomeIds = new Set(
      splitIncomes.filter((i) => i.split_id === splitId).map((i) => i.transaction_id).filter(Boolean)
    );

    const unlinkedTransactions = normalizedTransactions.filter(
      (t) => t.type === "expense" && !linkedTransactionIds.has(t.id)
    );

    const unlinkedIncomeTx = normalizedTransactions.filter(
      (t) => t.type === "income" && (Number(t.amount) || 0) > 0 && !linkedIncomeIds.has(t.id)
    );

    if (unlinkedTransactions.length === 0 && unlinkedIncomeTx.length === 0) {
      console.log("[Tracker] No unlinked transactions found in Warden Insights for auto-import");
      return;
    }

    const uniqueUnlinked = [];
    const seenIds = new Set();
    for (const tx of unlinkedTransactions) {
      const key = tx?.id;
      if (key && seenIds.has(key)) continue;
      if (key) seenIds.add(key);
      uniqueUnlinked.push(tx);
    }

    const uniqueUnlinkedIncome = [];
    const seenIncome = new Set();
    for (const tx of unlinkedIncomeTx) {
      const key = tx?.id;
      if (key && seenIncome.has(key)) continue;
      if (key) seenIncome.add(key);
      uniqueUnlinkedIncome.push(tx);
    }

    // Use category from Insights if it matches a split category, otherwise keyword-match
    const getCategoryForSplit = (importedCat, description = "") => {
      // 1. User-defined description rules (highest priority)
      const ruleHit = categoryRules[normalizeDescriptionKey(description)];
      if (ruleHit) return ruleHit;

      const splitCats = splitData?.categories || [];

      // 2. Imported category matches a split category (case-insensitive)
      if (importedCat) {
        const importedLower = importedCat.toLowerCase();
        const exactMatch = splitCats.find((c) => c.name.toLowerCase() === importedLower);
        if (exactMatch) return exactMatch.name;
      }

      // 3. Run global keyword matcher and see if it matches a split category
      const suggested = suggestCategory(description);
      if (suggested !== "Other") {
        const suggestedMatch = splitCats.find((c) => c.name.toLowerCase() === suggested.toLowerCase());
        if (suggestedMatch) return suggestedMatch.name;
      }

      // 4. Fallback: first split category
      return splitCats[0]?.name || "Other";
    };

    const newPurchases = uniqueUnlinked.map((t) => {
      const category = getCategoryForSplit(t.category, t.description);
      return {
        id: crypto.randomUUID(),
        split_id: splitId,
        transaction_id: t.id,
        date: toDateOnlyString(t.date),
        amount: Math.abs(Number(t.amount) || 0),
        category: category,
        description: t.description || "",
      };
    });

    const newIncomes = uniqueUnlinkedIncome.map((t) => ({
      id: crypto.randomUUID(),
      split_id: splitId,
      transaction_id: t.id,
      date: toDateOnlyString(t.date),
      amount: Math.abs(Number(t.amount) || 0),
      category: "Income",
      description: t.description || "",
      type: "income",
    }));

    if (newPurchases.length > 0) {
      for (const purchase of newPurchases) {
        try {
          await fetch(`${API_URL}/purchases`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify(purchase),
          });
        } catch (err) {
          console.error("Error saving purchase to backend:", err);
        }
      }
      setPurchases((prev) => [...prev, ...newPurchases]);
      console.log("[Tracker] Auto-imported", newPurchases.length, "purchases from Warden Insights");
    }

    if (newIncomes.length > 0) {
      for (const income of newIncomes) {
        try {
          await fetch(`${API_URL}/purchases`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({
              id: income.id,
              split_id: income.split_id,
              transaction_id: income.transaction_id,
              date: income.date,
              amount: income.amount,
              category: "Income",
              description: income.description,
            }),
          });
        } catch (err) {
          console.error("Error saving income to backend:", err);
        }
      }
      setSplitIncomes((prev) => [...prev, ...newIncomes.map(sanitizeIncome).filter(Boolean)]);
      console.log("[Tracker] Auto-imported", newIncomes.length, "incomes from Warden Insights");
    }
  };

  // =========================
  // NEW: Pivot-table helpers
  // =========================
  const splitCategoryNames = useMemo(() => {
    return (selectedSplitData?.categories || []).map((c) => c.name);
  }, [selectedSplitData]);

  // Pre-compute purchase dates for faster range queries
  const purchasesWithDates = useMemo(() => {
    return filteredPurchases.map((p) => ({
      ...p,
      _dateObj: toLocalDate(p.date),
    }));
  }, [filteredPurchases]);

  const getPurchasesInRange = useCallback(
    (start, end) => {
      const startTime = start.getTime();
      const endTime = end.getTime();
      return purchasesWithDates.filter((p) => {
        const t = p._dateObj.getTime();
        return t >= startTime && t <= endTime;
      });
    },
    [purchasesWithDates]
  );

  const buildCategoryTotals = useCallback(
    (purchasesInRange) => {
      const totals = {};
      const counts = {};

      for (const name of splitCategoryNames) {
        totals[name] = 0;
        counts[name] = 0;
      }

      for (const p of purchasesInRange) {
        const cat = p.category || "Other";
        if (totals[cat] == null) {
          totals[cat] = 0;
          counts[cat] = 0;
        }
        totals[cat] += Number(p.amount) || 0;
        counts[cat] += 1;
      }

      return { totals, counts };
    },
    [splitCategoryNames]
  );

  const formatMoney = useCallback((n) => `£${Number(n || 0).toFixed(2)}`, []);

  // alias because your tooltip uses money(...)
  const money = useCallback((n) => `£${Number(n || 0).toFixed(2)}`, []);

  //  returns the purchases inside a cell (period range + category) - memoized with cache
  const cellItemsCache = useRef(new Map());
  const lastPurchasesRef = useRef(null);
  
  // Clear cache only when purchases actually change (reference check)
  if (lastPurchasesRef.current !== purchasesWithDates) {
    cellItemsCache.current.clear();
    lastPurchasesRef.current = purchasesWithDates;
  }
  
  const getCellItems = useCallback(
    (start, end, categoryName) => {
      const startTime = start.getTime();
      const endTime = end.getTime();
      const cacheKey = `${startTime}-${endTime}-${categoryName}`;
      
      // Check cache first
      if (cellItemsCache.current.has(cacheKey)) {
        return cellItemsCache.current.get(cacheKey);
      }
      
      // Use precomputed dates for faster filtering
      const items = purchasesWithDates
        .filter((p) => {
          const t = p._dateObj.getTime();
          return t >= startTime && t <= endTime && (p.category || "Other") === categoryName;
        })
        .sort((a, b) => b._dateObj.getTime() - a._dateObj.getTime())
        .map((p) => ({
          id: p.id,
          description: p.description || "–",
          amount: Number(p.amount) || 0,
          category: p.category || "Other",
          transaction_id: p.transaction_id || null,
        }));

      // Cache the result (limit cache size to prevent memory issues)
      if (cellItemsCache.current.size > 500) {
        cellItemsCache.current.clear();
      }
      cellItemsCache.current.set(cacheKey, items);
      
      return items;
    },
    [purchasesWithDates]
  );

  // View totals (for Summary + footer)
  // Use precomputed dates for faster filtering
  const getWeekPurchases = useCallback(() => {
    const startTime = weekStart.getTime();
    const endTime = weekEnd.getTime();
    return purchasesWithDates.filter((p) => {
      const t = p._dateObj.getTime();
      return t >= startTime && t <= endTime;
    });
  }, [purchasesWithDates, weekStart, weekEnd]);

  const getWeekTotal = useMemo(() => getWeekPurchases().reduce((sum, p) => sum + p.amount, 0), [getWeekPurchases]);

  const getMonthPurchases = useCallback(() => {
    const startTime = monthStart.getTime();
    const endTime = monthEnd.getTime();
    return purchasesWithDates.filter((p) => {
      const t = p._dateObj.getTime();
      return t >= startTime && t <= endTime;
    });
  }, [purchasesWithDates, monthStart, monthEnd]);

  const getMonthTotal = useMemo(
    () => getMonthPurchases().reduce((sum, p) => sum + p.amount, 0),
    [getMonthPurchases]
  );

  const getYearPurchases = useCallback(() => {
    const startTime = yearStart.getTime();
    const endTime = yearEnd.getTime();
    return purchasesWithDates.filter((p) => {
      const t = p._dateObj.getTime();
      return t >= startTime && t <= endTime;
    });
  }, [purchasesWithDates, yearStart, yearEnd]);

  const getYearTotal = useMemo(() => getYearPurchases().reduce((sum, p) => sum + p.amount, 0), [getYearPurchases]);

  const getViewPurchases = useCallback(() => {
    if (viewMode === "yearly") return getYearPurchases();
    if (viewMode === "monthly") return getMonthPurchases();
    return getWeekPurchases();
  }, [viewMode, getYearPurchases, getMonthPurchases, getWeekPurchases]);

  const getViewTotal = useMemo(() => {
    if (viewMode === "yearly") return getYearTotal;
    if (viewMode === "monthly") return getMonthTotal;
    return getWeekTotal;
  }, [viewMode, getYearTotal, getMonthTotal, getWeekTotal]);

  const viewIncomeTotal = useMemo(
    () => viewIncomeTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
    [viewIncomeTransactions]
  );

  const viewBudgetIncome = useMemo(() => {
    let budgetIncome = viewIncomeTotal;
    if (
      viewIncomeTotal === 0 &&
      selectedIncomeSettings?.use_expected_when_no_actual &&
      selectedIncomeSettings?.expected_amount > 0
    ) {
      const expectedFreq = selectedIncomeSettings.frequency;
      if (viewMode === "weekly") {
        budgetIncome =
          expectedFreq === "monthly"
            ? selectedIncomeSettings.expected_amount / 4.33
            : expectedFreq === "yearly"
            ? selectedIncomeSettings.expected_amount / 52
            : selectedIncomeSettings.expected_amount;
      } else if (viewMode === "monthly") {
        budgetIncome =
          expectedFreq === "weekly"
            ? selectedIncomeSettings.expected_amount * 4.33
            : expectedFreq === "yearly"
            ? selectedIncomeSettings.expected_amount / 12
            : selectedIncomeSettings.expected_amount;
      } else {
        budgetIncome =
          expectedFreq === "weekly"
            ? selectedIncomeSettings.expected_amount * 52
            : expectedFreq === "monthly"
            ? selectedIncomeSettings.expected_amount * 12
            : selectedIncomeSettings.expected_amount;
      }
    }
    return budgetIncome;
  }, [viewIncomeTotal, selectedIncomeSettings, viewMode]);

  const viewUsingExpectedIncome = useMemo(
    () => viewIncomeTotal === 0 && viewBudgetIncome > 0,
    [viewIncomeTotal, viewBudgetIncome]
  );

  const formatDisplayDate = (value) => {
    const d = toLocalDate(value);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Expected income modal open
  const openExpectedIncomeModal = () => {
    if (selectedIncomeSettings) {
      setExpectedIncomeForm({
        expected_amount: selectedIncomeSettings.expected_amount?.toString() || "",
        next_payday: selectedIncomeSettings.next_payday || "",
        frequency: selectedIncomeSettings.frequency || selectedSplitData?.frequency || "monthly",
        use_expected_when_no_actual: selectedIncomeSettings.use_expected_when_no_actual !== false,
      });
    } else {
      setExpectedIncomeForm({
        expected_amount: "",
        next_payday: "",
        frequency: selectedSplitData?.frequency || "monthly",
        use_expected_when_no_actual: true,
      });
    }
    setShowExpectedIncomeModal(true);
  };

  const handleSaveExpectedIncome = async () => {
    if (!selectedSplit) return;

    try {
      const payload = {
        split_id: selectedSplit,
        expected_amount: Math.abs(parseFloat(expectedIncomeForm.expected_amount) || 0),
        frequency: expectedIncomeForm.frequency,
        next_payday: expectedIncomeForm.next_payday || null,
        use_expected_when_no_actual: expectedIncomeForm.use_expected_when_no_actual,
      };

      const response = await fetch(`${API_URL}/income-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const saved = await response.json();
        setIncomeSettings((prev) => {
          const existing = prev.findIndex((s) => s.split_id === selectedSplit);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = saved;
            return updated;
          }
          return [...prev, saved];
        });
        setShowExpectedIncomeModal(false);
      } else {
        console.error("Failed to save expected income");
        alert("Failed to save expected income settings");
      }
    } catch (err) {
      console.error("Error saving expected income:", err);
      alert("Failed to save expected income settings");
    }
  };

  return (
    <div className="container-fluid py-4" style={{ maxWidth: "100%", minHeight: "100vh", marginTop: "80px" }}>

      <Navbar />

      <TrackerHeader
        savedSplits={savedSplits}
        selectedSplit={selectedSplit}
        setSelectedSplit={setSelectedSplit}
        onUpdateSplit={handleUpdateSplit}
        onDeleteSplit={handleDeleteSplit}
      />

      {selectedSplit && (
        <>
          {/* Period Navigation */}
          <PeriodNavigation
            viewMode={viewMode}
            weekStart={weekStart}
            weekEnd={weekEnd}
            monthStart={monthStart}
            yearStart={yearStart}
            previousWeek={previousWeek}
            nextWeek={nextWeek}
            goToCurrentWeek={goToCurrentWeek}
            previousMonth={previousMonth}
            nextMonth={nextMonth}
            goToCurrentMonth={goToCurrentMonth}
            previousYear={previousYear}
            nextYear={nextYear}
            goToCurrentYear={goToCurrentYear}
          />

          {/* Summary Box */}
          <SummaryCard
            selectedSplitData={selectedSplitData}
            viewMode={viewMode}
            prefersReducedMotion={prefersReducedMotion}
            getViewTotal={getViewTotal}
            viewBudgetIncome={viewBudgetIncome}
            viewUsingExpectedIncome={viewUsingExpectedIncome}
            getViewPurchases={getViewPurchases}
          />

          <div className="row g-3">
            {/* Sidebar */}
            <div className="col-12 col-lg-3">
              <div className="tracker-sidebar-stack">
                <div className="tracker-sidebar-item">
                  <IncomeCard
                    prefersReducedMotion={prefersReducedMotion}
                    openExpectedIncomeModal={openExpectedIncomeModal}
                    isUsingExpectedIncome={isUsingExpectedIncome}
                    selectedIncomeSettings={selectedIncomeSettings}
                    viewIncomeTransactions={viewIncomeTransactions}
                    viewMode={viewMode}
                    toLocalDate={toLocalDate}
                    formatDisplayDate={formatDisplayDate}
                  />
                </div>
              </div>
            </div>

            {/* Main */}
            <div className="col-12 col-lg-9">
              <PurchasesPivotTable
                viewMode={viewMode}
                setViewMode={setViewMode}
                prefersReducedMotion={prefersReducedMotion}
                weekDays={weekDays}
                dayNames={dayNames}
                monthWeeks={monthWeeks}
                monthNames={monthNames}
                yearStart={yearStart}
                splitCategoryNames={splitCategoryNames}
                getPurchasesInRange={getPurchasesInRange}
                buildCategoryTotals={buildCategoryTotals}
                getCellItems={getCellItems}
                toDateOnlyString={toDateOnlyString}
                formatMoney={formatMoney}
                money={money}
                getViewTotal={getViewTotal}
                handleUpdatePurchaseCategory={handleUpdatePurchaseCategory}
                editingPurchaseId={editingPurchaseId}
                setEditingPurchaseId={setEditingPurchaseId}
                allCategoryNames={splitCategoryNames}
              />
            </div>
          </div>

          {/* Add Purchase Modal */}
          <AddPurchaseModal
            showAddModal={showAddModal}
            setShowAddModal={setShowAddModal}
            newPurchase={newPurchase}
            setNewPurchase={setNewPurchase}
            selectedSplitData={selectedSplitData}
            handleAddPurchase={handleAddPurchase}
          />

          {/* Import Modal */}
          <ImportModal
            showImportModal={showImportModal}
            setShowImportModal={setShowImportModal}
            handleBulkAdd={handleBulkAdd}
          />

          {/* Expected Income Modal */}
          <ExpectedIncomeModal
            showExpectedIncomeModal={showExpectedIncomeModal}
            setShowExpectedIncomeModal={setShowExpectedIncomeModal}
            expectedIncomeForm={expectedIncomeForm}
            setExpectedIncomeForm={setExpectedIncomeForm}
            selectedSplitData={selectedSplitData}
            selectedIncomeSettings={selectedIncomeSettings}
            handleSaveExpectedIncome={handleSaveExpectedIncome}
          />
        </>
      )}
    </div>
  );
}
