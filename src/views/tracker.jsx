import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/navbar.jsx";
import CsvPdfUpload from "../components/csv-pdf-upload.jsx";
import { useTransactions } from "../state/TransactionsContext";
import { generateId } from "../models/transaction";

const API_URL = "http://localhost:4000/api";

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
  const { addTransaction, bulkAddTransactions, transactions: globalTransactions = [] } = useTransactions?.() ?? {};
  const [savedSplits, setSavedSplits] = useState([]);
  const [selectedSplit, setSelectedSplit] = useState(null);
  const [viewMode, setViewMode] = useState("weekly"); // "weekly", "monthly", or "yearly"
  const [currentDate, setCurrentDate] = useState(new Date());
  const [purchases, setPurchases] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [newPurchase, setNewPurchase] = useState(() => ({
    date: toDateOnlyString(new Date()),
    amount: "",
    category: "",
    description: "",
  }));
  const [showImportModal, setShowImportModal] = useState(false);
  const [unlinkedTransactionsCount, setUnlinkedTransactionsCount] = useState(0);
  const [categoryRules, setCategoryRules] = useState({}); // description -> category
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [isImportingFromInsights, setIsImportingFromInsights] = useState(false);
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

  // Restore selected split from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("walletwardenSelectedSplit");
    if (saved && !selectedSplit) {
      setSelectedSplit(saved);
    }
  }, []);

  // Persist selected split to localStorage
  useEffect(() => {
    if (selectedSplit) {
      localStorage.setItem("walletwardenSelectedSplit", selectedSplit);
    }
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

  // Persist category rules (only after initial load to avoid overwriting)
  useEffect(() => {
    if (!categoryRulesLoaded.current) return;
    try {
      localStorage.setItem("walletwardenCategoryRules", JSON.stringify(categoryRules));
    } catch (e) {
      console.warn("Failed to save category rules", e);
    }
  }, [categoryRules]);

  // Load persisted split incomes from localStorage (backup only, backend is primary)
  useEffect(() => {
    // Only load from localStorage if backend hasn't loaded yet
    // Backend data will override this
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

  // Persist split incomes to localStorage and sync to backend
  useEffect(() => {
    if (!splitIncomesLoaded.current) return;
    try {
      localStorage.setItem("walletwardenSplitIncomes", JSON.stringify(splitIncomes));
    } catch (e) {
      console.warn("Failed to save split incomes", e);
    }

    // Also sync split incomes to backend as purchases (they're stored in purchases table)
    // Only sync after we've loaded from backend to prevent overwriting
    if (!isLoading && incomesLoadedFromBackend.current && splitIncomes.length > 0) {
      const syncIncomesToBackend = async () => {
        try {
          const token = localStorage.getItem("walletwarden-token") || "dev-user";
          for (const income of splitIncomes) {
            if (!income.split_id) continue;
            await fetch(`${API_URL}/purchases`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({
                id: income.id,
                split_id: income.split_id,
                transaction_id: income.transaction_id,
                date: income.date,
                amount: income.amount,
                category: income.category || "Income",
                description: income.description,
              }),
            });
          }
          console.log('[Tracker] Synced', splitIncomes.length, 'incomes to backend');
        } catch (err) {
          console.error("Error syncing incomes to backend:", err);
        }
      };
      syncIncomesToBackend();
    }
  }, [splitIncomes, isLoading]);

  useEffect(() => {
    const loadDataFromBackend = async () => {
      try {
        const token = localStorage.getItem("walletwarden-token") || "dev-user";

        // Load splits from backend
        const splitsResponse = await fetch(`${API_URL}/splits`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        let loadedSplits = [];
        if (splitsResponse.ok) {
          loadedSplits = await splitsResponse.json();
          console.log('[Tracker] Loaded splits from backend:', loadedSplits.length);
          setSavedSplits(loadedSplits);

          // Also update localStorage
          localStorage.setItem("walletwardenSplits", JSON.stringify(loadedSplits));

          // Restore selected split from localStorage or use first split
          const savedSplitId = localStorage.getItem("walletwardenSelectedSplit");
          if (savedSplitId && loadedSplits.some(s => s.id === savedSplitId)) {
            setSelectedSplit(savedSplitId);
          } else if (loadedSplits.length > 0 && !selectedSplit) {
            setSelectedSplit(loadedSplits[0].id);
          }
        }
        
        // Also check localStorage for any splits saved there
        const localSplits = localStorage.getItem("walletwardenSplits");
        if (localSplits) {
          const parsedLocal = JSON.parse(localSplits);
          // Merge: add any local splits not already in loadedSplits
          const mergedSplits = [...loadedSplits];
          for (const localSplit of parsedLocal) {
            if (!mergedSplits.some(s => s.id === localSplit.id)) {
              mergedSplits.push(localSplit);
            }
          }
          if (mergedSplits.length > loadedSplits.length) {
            setSavedSplits(mergedSplits);
            const savedSplitId = localStorage.getItem("walletwardenSelectedSplit");
            if (savedSplitId && mergedSplits.some(s => s.id === savedSplitId)) {
              setSelectedSplit(savedSplitId);
            } else if (mergedSplits.length > 0 && !selectedSplit) {
              setSelectedSplit(mergedSplits[0].id);
            }
          }
        }

        // Load ALL purchases (don't filter by split - we'll filter in display)
        const purchasesResponse = await fetch(`${API_URL}/purchases`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (purchasesResponse.ok) {
          const allPurchases = await purchasesResponse.json();
          console.log('[Tracker] Loaded purchases from backend:', allPurchases.length, allPurchases);
          
          // Separate income purchases from expense purchases
          // Income purchases have category "Income" or were saved as income type
          const incomePurchases = allPurchases.filter(p => 
            p.category === "Income" || p.category?.toLowerCase() === "income"
          );
          const expensePurchases = allPurchases.filter(p => 
            p.category !== "Income" && p.category?.toLowerCase() !== "income"
          );
          
          console.log('[Tracker] Expense purchases:', expensePurchases.length);
          console.log('[Tracker] Income purchases:', incomePurchases.length);
          
          // Mark as loaded BEFORE setting state to prevent sync from overwriting
          purchasesLoadedFromBackend.current = true;
          setPurchases(expensePurchases);
          
          // Convert income purchases to splitIncomes format and merge with localStorage
          if (incomePurchases.length > 0) {
            const loadedIncomes = incomePurchases.map(p => sanitizeIncome({
              id: p.id,
              split_id: p.split_id,
              transaction_id: p.transaction_id,
              date: p.date,
              amount: p.amount,
              category: p.category || "Income",
              description: p.description,
              type: "income",
            })).filter(Boolean);
            
            // Mark incomes as loaded and set state
            incomesLoadedFromBackend.current = true;
            setSplitIncomes(loadedIncomes);
          } else {
            incomesLoadedFromBackend.current = true;
          }
        } else {
          purchasesLoadedFromBackend.current = true;
          incomesLoadedFromBackend.current = true;
        }

        // Load income settings
        const incomeSettingsResponse = await fetch(`${API_URL}/income-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (incomeSettingsResponse.ok) {
          const allIncomeSettings = await incomeSettingsResponse.json();
          console.log('[Tracker] Loaded income settings from backend:', allIncomeSettings.length);
          setIncomeSettings(allIncomeSettings);
          incomeSettingsLoaded.current = true;
        }

        dataLoadedFromBackend.current = true;
      } catch (err) {
        console.error("Error loading data from backend:", err);

        // Fallback to localStorage on error
        const localSplits = localStorage.getItem("walletwardenSplits");
        if (localSplits) {
          const splits = JSON.parse(localSplits);
          setSavedSplits(splits);
          const savedSplitId = localStorage.getItem("walletwardenSelectedSplit");
          if (savedSplitId && splits.some(s => s.id === savedSplitId)) {
            setSelectedSplit(savedSplitId);
          } else if (splits.length > 0) {
            setSelectedSplit(splits[0].id);
          }
        }
        dataLoadedFromBackend.current = true;
      } finally {
        setIsLoading(false);
      }
    };

    loadDataFromBackend();
  }, []);

  // Filter purchases by selected split
  const normalizedTransactions = useMemo(() => {
    if (!Array.isArray(globalTransactions)) return [];
    return globalTransactions.map((t) => {
      const rawType = (t?.type || "").toString().trim().toLowerCase();
      const amount = Number(t?.amount) || 0;

      // Match Warden Insights logic: default to expense unless explicitly marked as income
      // This ensures consistency between the two views
      const type = rawType === "income" ? "income" : "expense";

      const description = (t?.description || "").toString().trim();
      return { ...t, type, amount, description };
    });
  }, [globalTransactions]);

  const filteredPurchases = useMemo(() => {
    if (!selectedSplit) return [];
    return purchases.filter((p) => p.split_id === selectedSplit);
  }, [purchases, selectedSplit]);

  const filteredIncomes = useMemo(() => {
    if (!selectedSplit) return [];
    return splitIncomes
      .map(sanitizeIncome)
      .filter(Boolean)
      .filter((i) => i.split_id === selectedSplit && (Number(i.amount) || 0) > 0);
  }, [splitIncomes, selectedSplit]);

  // Only show incomes that have been explicitly synced into this split (via Import Now)
  const incomeTransactions = useMemo(() => {
    return filteredIncomes;
  }, [filteredIncomes]);

  // Week navigation helpers
  const getWeekStart = useCallback((date) => {
    const d = toLocalDate(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday as start of week
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
  }, []);

  const getWeekEnd = useCallback((date) => {
    const start = getWeekStart(date);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  }, [getWeekStart]);

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

  const goToCurrentWeek = () => {
    setCurrentDate(new Date());
  };

  // Month navigation helpers
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

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToCurrentMonth = () => {
    setCurrentDate(new Date());
  };

  // Year navigation helpers
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

  const previousYear = () => {
    setCurrentDate(new Date(currentDate.getFullYear() - 1, 0, 1));
  };

  const nextYear = () => {
    setCurrentDate(new Date(currentDate.getFullYear() + 1, 0, 1));
  };

  const goToCurrentYear = () => {
    setCurrentDate(new Date());
  };

  // Get weeks in current month for monthly grid view
  const monthWeeks = useMemo(() => {
    const weeks = [];
    const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    
    let currentWeekStart = getWeekStart(firstDay);
    let weekNum = 1;
    
    while (currentWeekStart <= lastDay) {
      const weekEnd = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), currentWeekStart.getDate() + 6);
      weeks.push({
        num: weekNum,
        start: new Date(currentWeekStart),
        end: weekEnd,
        label: `Week ${weekNum}`
      });
      currentWeekStart = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), currentWeekStart.getDate() + 7);
      weekNum++;
    }
    return weeks;
  }, [monthStart, getWeekStart]);

  // Month names for yearly view
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const periodBounds = useMemo(() => {
    if (!selectedSplitData) return { start: null, end: null, frequency: null };

    const freq = selectedSplitData.frequency;
    const base = toLocalDate(currentDate);

    if (freq === "weekly") {
      // Use getWeekStart for consistency (Monday start)
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

  const getPeriodPurchases = useCallback(() => {
    if (!selectedSplitData) return filteredPurchases;
    return filteredPurchases.filter((p) => isInCurrentPeriod(p.date));
  }, [filteredPurchases, isInCurrentPeriod, selectedSplitData]);

  // Income filtered by week (for display in Income card)
  const weekIncomeTransactions = useMemo(() => {
    if (!selectedSplit) return [];
    return incomeTransactions.filter((tx) => {
      const txDate = toLocalDate(tx.date);
      return txDate >= weekStart && txDate <= weekEnd;
    });
  }, [incomeTransactions, selectedSplit, weekStart, weekEnd]);

  // Income filtered by month
  const monthIncomeTransactions = useMemo(() => {
    if (!selectedSplit) return [];
    return incomeTransactions.filter((tx) => {
      const txDate = toLocalDate(tx.date);
      return txDate >= monthStart && txDate <= monthEnd;
    });
  }, [incomeTransactions, selectedSplit, monthStart, monthEnd]);

  // Income filtered by year
  const yearIncomeTransactions = useMemo(() => {
    if (!selectedSplit) return [];
    return incomeTransactions.filter((tx) => {
      const txDate = toLocalDate(tx.date);
      return txDate >= yearStart && txDate <= yearEnd;
    });
  }, [incomeTransactions, selectedSplit, yearStart, yearEnd]);

  // Current view income (based on viewMode)
  const viewIncomeTransactions = useMemo(() => {
    if (viewMode === "yearly") return yearIncomeTransactions;
    if (viewMode === "monthly") return monthIncomeTransactions;
    return weekIncomeTransactions;
  }, [viewMode, yearIncomeTransactions, monthIncomeTransactions, weekIncomeTransactions]);

  // Income filtered by split's period (weekly/monthly/yearly) for budget calculations
  const periodIncomeTransactions = useMemo(() => {
    if (!selectedSplit) return [];
    // Use periodBounds to filter by split frequency, not just current week
    if (periodBounds.start && periodBounds.end) {
      return incomeTransactions.filter((tx) => {
        const txDate = toLocalDate(tx.date);
        return txDate >= periodBounds.start && txDate <= periodBounds.end;
      });
    }
    // Fallback: return all income for the split
    return incomeTransactions;
  }, [incomeTransactions, selectedSplit, periodBounds]);

  const periodIncomeTotal = useMemo(() => {
    return periodIncomeTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }, [periodIncomeTransactions]);

  // Get income settings for the selected split
  const selectedIncomeSettings = useMemo(() => {
    if (!selectedSplit) return null;
    return incomeSettings.find((s) => s.split_id === selectedSplit) || null;
  }, [incomeSettings, selectedSplit]);

  // Budget income total: use actual income if available, otherwise fallback to expected income
  const budgetIncomeTotal = useMemo(() => {
    // If we have actual income in the period, use it
    if (periodIncomeTotal > 0) {
      return periodIncomeTotal;
    }
    // Otherwise, check if we should use expected income
    if (
      selectedIncomeSettings &&
      selectedIncomeSettings.use_expected_when_no_actual &&
      selectedIncomeSettings.expected_amount > 0
    ) {
      return selectedIncomeSettings.expected_amount;
    }
    return 0;
  }, [periodIncomeTotal, selectedIncomeSettings]);

  // Check if we're using expected income (for UI display)
  const isUsingExpectedIncome = useMemo(() => {
    return (
      periodIncomeTotal === 0 &&
      selectedIncomeSettings &&
      selectedIncomeSettings.use_expected_when_no_actual &&
      selectedIncomeSettings.expected_amount > 0
    );
  }, [periodIncomeTotal, selectedIncomeSettings]);

  // Count unlinked transactions from Warden Insights
  useEffect(() => {
    // Wait until all data is loaded before calculating unlinked count
    if (!selectedSplit || !normalizedTransactions || isLoading || !purchasesLoadedFromBackend.current) {
      setUnlinkedTransactionsCount(0);
      return;
    }

    console.log('[Tracker] Calculating unlinked count...');
    console.log('[Tracker] Normalized transactions:', normalizedTransactions.length);
    console.log('[Tracker] All purchases:', purchases.length);

    // Get all purchase IDs that are already linked to ANY split (use all purchases, not filtered)
    const linkedTransactionIds = new Set(
      purchases.map(p => p.transaction_id).filter(Boolean)
    );

    // Also include split incomes that are linked
    splitIncomes.forEach(i => {
      if (i.transaction_id) linkedTransactionIds.add(i.transaction_id);
    });

    console.log('[Tracker] Linked transaction IDs:', linkedTransactionIds.size);

    // Count expense transactions that aren't linked to any purchase (use normalized type)
    const unlinked = normalizedTransactions.filter(t => 
      t.type === "expense" && !linkedTransactionIds.has(t.id)
    );

    console.log('[Tracker] Unlinked expense transactions:', unlinked.length);
    setUnlinkedTransactionsCount(unlinked.length);
  }, [normalizedTransactions, purchases, splitIncomes, selectedSplit, isLoading]);



  // Sync splits to backend (only after initial load)
  useEffect(() => {
    if (isLoading) return; // Don't sync during initial load
    
    const syncSplitsToBackend = async () => {
      if (savedSplits.length === 0) return;
      
      try {
        const token = localStorage.getItem("walletwarden-token") || "dev-user";
        for (const split of savedSplits) {
          await fetch(`${API_URL}/splits`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
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
    };

    syncSplitsToBackend();
  }, [savedSplits, isLoading]);

  // Sync purchases to backend (only after initial load from backend is complete)
  useEffect(() => {
    // Don't sync until we've loaded from backend first
    if (isLoading || !purchasesLoadedFromBackend.current) return;
    
    const syncPurchasesToBackend = async () => {
      if (purchases.length === 0) return;

      try {
        const token = localStorage.getItem("walletwarden-token") || "dev-user";
        
        // Sync ALL purchases, not just filtered by selectedSplit
        for (const purchase of purchases) {
          if (!purchase.split_id) continue;
          await fetch(`${API_URL}/purchases`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: purchase.id,
              split_id: purchase.split_id,
              transaction_id: purchase.transaction_id,
              date: purchase.date,
              amount: purchase.amount,
              category: purchase.category,
              description: purchase.description,
            }),
          });
        }
        console.log('[Tracker] Synced', purchases.length, 'purchases to backend');
      } catch (err) {
        console.error("Error syncing purchases:", err);
      }
    };

    syncPurchasesToBackend();
  }, [purchases, isLoading]);

  // Note: Purchases are loaded in the main loadDataFromBackend effect
  // They are stored unfiltered and filtered in display via filteredPurchases memo



  const handleAddPurchase = () => {
    if (!newPurchase.amount || !newPurchase.category) {
      alert("Please fill in amount and category");
      return;
    }

    // Create a linked transaction id so this purchase won't appear as unlinked
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

    setPurchases([...purchases, purchase]);

    // Add matching transaction with the same id
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
  };

  const handleDeletePurchase = async (purchaseId) => {
    if (!confirm("Are you sure you want to delete this purchase?")) return;

    try {
      const token = localStorage.getItem("walletwarden-token") || "dev-user";
      const response = await fetch(`${API_URL}/purchases/${purchaseId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setPurchases((prev) => prev.filter((p) => p.id !== purchaseId));
        setSyncMessage("Purchase deleted ✓");
        setTimeout(() => setSyncMessage(""), 2000);
      }
    } catch (err) {
      console.error("Error deleting purchase:", err);
      alert("Failed to delete purchase");
    }
  };

  const handleBulkAdd = (transactions) => {
    // Assign stable ids to imported transactions and persist them
    let withIds = transactions || [];
    if (Array.isArray(withIds)) {
      withIds = withIds.map((t) => ({ ...t, id: t.id || generateId() }));
    }
    if (typeof bulkAddTransactions === "function") {
      bulkAddTransactions(withIds);
    }
    
    // Function to match imported category to split category
    const matchCategory = (importedCat, description = "") => {
      const ruleHit = categoryRules[normalizeDescriptionKey(description)];
      if (ruleHit) return ruleHit;

      // Generic keywords organized by type - avoid overlaps between incompatible categories
      const keywordsByType = {
        food: ["tesco", "sainsbury", "asda", "morrisons", "lidl", "aldi", "waitrose", "co-op", "coop", "grocery", "supermarket", "bakery", "deli", "market", "restaurant", "cafe", "pizza", "burger", "mcdonald", "kfc", "subway", "starbucks", "costa", "pub", "bar", "meals", "food", "greggs", "pret", "leon"],
        petrol: ["bp", "shell", "esso", "tesco fuel", "sainsbury fuel", "petrol", "diesel", "fuel", "chevron"],
        entertainment: ["cinema", "netflix", "spotify", "game", "steam", "playstation", "xbox", "nintendo", "theatre", "concert", "ticket", "movie", "film", "music", "entertainment"],
        utilities: ["water", "gas", "electric", "council tax", "broadband", "internet", "phone", "mobile", "virgin", "bt", "plusnet", "bills"],
        health: ["pharmacy", "doctor", "dentist", "hospital", "medical", "gym", "fitness", "health", "optician", "boots", "nhs", "wellbeing"],
        shopping: ["amazon", "ebay", "argos", "john lewis", "marks spencer", "h&m", "zara", "clothes", "fashion", "homeware", "furniture", "ikea", "b&q", "wickes", "screwfix", "shop"],
        subscriptions: ["subscription", "adobe", "microsoft", "apple"],
        bills: ["bill", "council tax", "water", "gas", "electric", "broadband", "phone", "utility", "council", "rates"],
        savings: ["savings", "save", "transfer", "saving"],
        investing: ["invest", "investment", "broker", "trading"],
      };

      const searchText = (importedCat + " " + description).toLowerCase();
      
      // Try exact match first on imported category
      if (importedCat) {
        const importedLower = importedCat.toLowerCase();
        const exactMatch = selectedSplitData?.categories.find(
          c => c.name.toLowerCase() === importedLower
        );
        if (exactMatch) {
          return exactMatch.name;
        }
      }
      
      // For each category in the split, try to match keywords
      for (const category of selectedSplitData?.categories || []) {
        const categoryLower = category.name.toLowerCase();
        
        // Get keywords for this category name
        const directKeywords = keywordsByType[categoryLower];
        if (directKeywords && directKeywords.some(kw => searchText.includes(kw))) {
          return category.name;
        }
        
        // Then try partial match on keyword type names
        for (const [typeKey, keywords] of Object.entries(keywordsByType)) {
          if (categoryLower.includes(typeKey) || typeKey.includes(categoryLower)) {
            if (keywords.some(kw => searchText.includes(kw))) {
              return category.name;
            }
          }
        }
      }
      
      // Default to first category or Other
      const defaultCat = selectedSplitData?.categories[0]?.name || "Other";
      return defaultCat;
    };

    // Convert transactions to purchases with split_id (use absolute value since expenses are negative)
    const newPurchases = withIds
      .filter(t => t.type === "expense")
      .map(t => {
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
      setPurchases(prev => [...prev, ...newPurchases]);
      
      // Automatically navigate to the period of the most recent uploaded transaction
      const mostRecentDate = newPurchases.reduce((latest, p) => {
        const pDate = toLocalDate(p.date);
        return pDate > latest ? pDate : latest;
      }, toLocalDate(newPurchases[0].date));
      
      setCurrentDate(mostRecentDate);
      
      setSyncMessage(`Added ${newPurchases.length} purchases from upload ✓ (viewing ${mostRecentDate.toLocaleDateString()})`);
      setTimeout(() => setSyncMessage(""), 3000);
    }
    
    setShowImportModal(false);
  };

  const handleImportFromWardenInsights = () => {
    if (isImportingFromInsights) return;
    setIsImportingFromInsights(true);

    if (!selectedSplit || !selectedSplitData) {
      alert("Please select a split first");
      setIsImportingFromInsights(false);
      return;
    }

    // Get all purchase IDs that are already linked (expenses)
    const linkedTransactionIds = new Set(
      purchases.map(p => p.transaction_id).filter(Boolean)
    );

    // Get all income IDs already linked to this split
    const linkedIncomeIds = new Set(
      splitIncomes.filter((i) => i.split_id === selectedSplit).map(i => i.transaction_id).filter(Boolean)
    );

    // Filter unlinked expense transactions
    const unlinkedTransactions = normalizedTransactions.filter(t => 
      t.type === "expense" && !linkedTransactionIds.has(t.id)
    );

    // Filter unlinked income transactions (positive only)
    const unlinkedIncomeTx = normalizedTransactions.filter(t => 
      t.type === "income" && (Number(t.amount) || 0) > 0 && !linkedIncomeIds.has(t.id)
    );

    if (unlinkedTransactions.length === 0 && unlinkedIncomeTx.length === 0) {
      alert("No unlinked transactions found in Warden Insights");
      setIsImportingFromInsights(false);
      return;
    }

    // Deduplicate by transaction id in case the source list contains duplicates
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

    // Use the same matching logic as handleBulkAdd
    const matchCategory = (importedCat, description = "") => {
      const ruleHit = categoryRules[normalizeDescriptionKey(description)];
      if (ruleHit) return ruleHit;

      const keywordsByType = {
        food: ["tesco", "sainsbury", "asda", "morrisons", "lidl", "aldi", "waitrose", "co-op", "coop", "grocery", "supermarket", "bakery", "deli", "market", "restaurant", "cafe", "pizza", "burger", "mcdonald", "kfc", "subway", "starbucks", "costa", "pub", "bar", "meals", "food", "greggs", "pret", "leon"],
        petrol: ["bp", "shell", "esso", "tesco fuel", "sainsbury fuel", "petrol", "diesel", "fuel", "chevron"],
        entertainment: ["cinema", "netflix", "spotify", "game", "steam", "playstation", "xbox", "nintendo", "theatre", "concert", "ticket", "movie", "film", "music", "entertainment"],
        utilities: ["water", "gas", "electric", "council tax", "broadband", "internet", "phone", "mobile", "virgin", "bt", "plusnet", "bills"],
        health: ["pharmacy", "doctor", "dentist", "hospital", "medical", "gym", "fitness", "health", "optician", "boots", "nhs", "wellbeing"],
        shopping: ["amazon", "ebay", "argos", "john lewis", "marks spencer", "h&m", "zara", "clothes", "fashion", "homeware", "furniture", "ikea", "b&q", "wickes", "screwfix", "shop"],
        subscriptions: ["subscription", "adobe", "microsoft", "apple"],
        bills: ["bill", "council tax", "water", "gas", "electric", "broadband", "phone", "utility", "council", "rates"],
        savings: ["savings", "save", "transfer", "saving"],
        investing: ["invest", "investment", "broker", "trading"],
      };

      const searchText = (importedCat + " " + description).toLowerCase();
      
      if (importedCat) {
        const importedLower = importedCat.toLowerCase();
        const exactMatch = selectedSplitData?.categories.find(
          c => c.name.toLowerCase() === importedLower
        );
        if (exactMatch) return exactMatch.name;
      }
      
      for (const category of selectedSplitData?.categories || []) {
        const categoryLower = category.name.toLowerCase();
        const directKeywords = keywordsByType[categoryLower];
        if (directKeywords && directKeywords.some(kw => searchText.includes(kw))) {
          return category.name;
        }
        
        for (const [typeKey, keywords] of Object.entries(keywordsByType)) {
          if (categoryLower.includes(typeKey) || typeKey.includes(categoryLower)) {
            if (keywords.some(kw => searchText.includes(kw))) {
              return category.name;
            }
          }
        }
      }
      
      return selectedSplitData?.categories[0]?.name || "Other";
    };

    // Convert unlinked transactions to purchases (use absolute value since expenses are negative)
    const newPurchases = uniqueUnlinked.map(t => {
      const matched = matchCategory(t.category, t.description);
      return {
        id: crypto.randomUUID(),
        split_id: selectedSplit,
        transaction_id: t.id, // Link to the global transaction
        date: toDateOnlyString(t.date),
        amount: Math.abs(Number(t.amount) || 0),
        category: matched,
        description: t.description || "",
      };
    });

    // Convert unlinked income transactions to split-bound incomes
    const newIncomes = uniqueUnlinkedIncome.map(t => ({
      id: crypto.randomUUID(),
      split_id: selectedSplit,
      transaction_id: t.id,
      date: toDateOnlyString(t.date),
      amount: Math.abs(Number(t.amount) || 0),
      category: t.category || "Income",
      description: t.description || "",
      type: "income",
    }));

    if (newPurchases.length > 0) {
      setPurchases(prev => [...prev, ...newPurchases]);
    }

    if (newIncomes.length > 0) {
      setSplitIncomes(prev => [...prev, ...newIncomes.map(sanitizeIncome).filter(Boolean)]);
    }

    const importedCount = newPurchases.length + newIncomes.length;
    if (importedCount > 0) {
      const mostRecentDate = [...newPurchases, ...newIncomes].reduce((latest, p) => {
        const pDate = toLocalDate(p.date);
        return pDate > latest ? pDate : latest;
      }, toLocalDate((newPurchases[0] || newIncomes[0]).date));
      setCurrentDate(mostRecentDate);
      setSyncMessage(`Imported ${importedCount} transaction${importedCount === 1 ? "" : "s"} from Warden Insights ✓`);
      setTimeout(() => setSyncMessage(""), 3000);
    }

    setIsImportingFromInsights(false);
  };

  const getPurchasesForDate = (date) => {
    if (!date) return [];
    const dateStr = toDateOnlyString(date);
    return filteredPurchases.filter((p) => toDateOnlyString(p.date) === dateStr);
  };

  const getWeekPurchases = useCallback(() => {
    return filteredPurchases.filter((p) => {
      const pDate = toLocalDate(p.date);
      return pDate >= weekStart && pDate <= weekEnd;
    });
  }, [filteredPurchases, weekStart, weekEnd]);

  const getWeekTotal = useMemo(() => {
    return getWeekPurchases().reduce((sum, p) => sum + p.amount, 0);
  }, [getWeekPurchases]);

  const getMonthPurchases = useCallback(() => {
    return filteredPurchases.filter((p) => {
      const pDate = toLocalDate(p.date);
      return pDate >= monthStart && pDate <= monthEnd;
    });
  }, [filteredPurchases, monthStart, monthEnd]);

  const getMonthTotal = useMemo(() => {
    return getMonthPurchases().reduce((sum, p) => sum + p.amount, 0);
  }, [getMonthPurchases]);

  const getYearPurchases = useCallback(() => {
    return filteredPurchases.filter((p) => {
      const pDate = toLocalDate(p.date);
      return pDate >= yearStart && pDate <= yearEnd;
    });
  }, [filteredPurchases, yearStart, yearEnd]);

  const getYearTotal = useMemo(() => {
    return getYearPurchases().reduce((sum, p) => sum + p.amount, 0);
  }, [getYearPurchases]);

  // Get purchases for a specific week in monthly view
  const getPurchasesForWeek = useCallback((weekStart, weekEnd) => {
    return filteredPurchases.filter((p) => {
      const pDate = toLocalDate(p.date);
      return pDate >= weekStart && pDate <= weekEnd;
    });
  }, [filteredPurchases]);

  // Get purchases for a specific month in yearly view
  const getPurchasesForMonth = useCallback((monthIndex) => {
    const mStart = new Date(yearStart.getFullYear(), monthIndex, 1);
    const mEnd = new Date(yearStart.getFullYear(), monthIndex + 1, 0);
    return filteredPurchases.filter((p) => {
      const pDate = toLocalDate(p.date);
      return pDate >= mStart && pDate <= mEnd;
    });
  }, [filteredPurchases, yearStart]);

  // View-based purchases and totals
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

  const formatDisplayDate = (value) => {
    const d = toLocalDate(value);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Normalize a description key for matching rules
  const normalizeDescriptionKey = (desc = "") => {
    return desc.toLowerCase().trim().replace(/\s+/g, " ");
  };

  const upsertCategoryRule = (desc, category) => {
    if (!desc || !category) return;
    const key = normalizeDescriptionKey(desc);
    setCategoryRules((prev) => ({ ...prev, [key]: category }));
  };

  const handleUpdatePurchaseCategory = (purchaseId, newCategory) => {
    if (!purchaseId || !newCategory) return;
    setPurchases((prev) =>
      prev.map((p) => (p.id === purchaseId ? { ...p, category: newCategory } : p))
    );

    // Find purchase to learn rule from its description
    const purchase = purchases.find((p) => p.id === purchaseId);
    if (purchase?.description) {
      upsertCategoryRule(purchase.description, newCategory);
    }

    setEditingPurchaseId(null);
    setSyncMessage("Category updated ✓");
    setTimeout(() => setSyncMessage(""), 1500);
  };

  // Open expected income modal with current settings pre-filled
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

  // Save expected income settings to backend
  const handleSaveExpectedIncome = async () => {
    if (!selectedSplit) return;

    try {
      const token = localStorage.getItem("walletwarden-token") || "dev-user";
      const payload = {
        split_id: selectedSplit,
        expected_amount: Math.abs(parseFloat(expectedIncomeForm.expected_amount) || 0),
        frequency: expectedIncomeForm.frequency,
        next_payday: expectedIncomeForm.next_payday || null,
        use_expected_when_no_actual: expectedIncomeForm.use_expected_when_no_actual,
      };

      const response = await fetch(`${API_URL}/income-settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const saved = await response.json();
        // Update local state
        setIncomeSettings((prev) => {
          const existing = prev.findIndex((s) => s.split_id === selectedSplit);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = saved;
            return updated;
          }
          return [...prev, saved];
        });
        setSyncMessage("Expected income saved ✓");
        setTimeout(() => setSyncMessage(""), 2000);
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
    <div className="container-fluid py-4 mt-5" style={{ maxWidth: 1200, minHeight: "100vh" }}>
      <Navbar />

      <div className="mb-4">
        {syncMessage && (
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            {syncMessage}
          </div>
        )}

        {savedSplits.length === 0 ? (
          <div className="alert alert-info">
            No saved splits found. Create a split on the Split Maker page first!
          </div>
        ) : (
          <div className="d-flex gap-3 align-items-end mb-3 flex-wrap">
            <div>
              <label className="form-label small fw-semibold">Select Split</label>
              <select
                className="form-select form-select-sm"
                value={selectedSplit || ""}
                onChange={(e) => setSelectedSplit(e.target.value)}
                style={{ minWidth: "180px" }}
              >
                <option value="">Choose a split…</option>
                {savedSplits.map((split) => (
                  <option key={split.id} value={split.id}>
                    {split.name} ({split.frequency})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label small fw-semibold">View</label>
              <select
                className="form-select form-select-sm"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                style={{ minWidth: "120px" }}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <h1 className="h4 mb-0 ms-auto">Warden <span className="text-primary">Tracker</span></h1>
          </div>
        )}

        {unlinkedTransactionsCount > 0 && selectedSplit && (
          <div className="alert alert-warning mb-3" role="alert">
            <div className="d-flex align-items-center justify-content-between gap-3">
              <div>
                <strong>📥 {unlinkedTransactionsCount} transaction{unlinkedTransactionsCount !== 1 ? 's' : ''}</strong> from Warden Insights {unlinkedTransactionsCount !== 1 ? 'are' : 'is'} not linked to this split yet.
                <br />
                <small className="text-body-secondary">Click "Import Now" to automatically categorize and add them to this split.</small>
              </div>
              <button 
                className="btn btn-primary"
                onClick={handleImportFromWardenInsights}
                disabled={isImportingFromInsights}
                style={{ whiteSpace: "nowrap" }}
              >
                {isImportingFromInsights ? "Importing..." : "Import Now"}
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedSplit && (
        <>
          {/* Period Navigation - Top Section */}
          <div className="d-flex align-items-center justify-content-between mb-4 pb-3 border-bottom">
            <h5 className="mb-0">
              {viewMode === "yearly" 
                ? yearStart.getFullYear().toString()
                : viewMode === "monthly" 
                  ? monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
                  : `Week of ${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${weekEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
              }
            </h5>
            <div className="d-flex gap-2 align-items-center">
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={viewMode === "yearly" ? previousYear : viewMode === "monthly" ? previousMonth : previousWeek}
                title={viewMode === "yearly" ? "Previous year" : viewMode === "monthly" ? "Previous month" : "Previous week"}
              >
                ← Prev
              </button>
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={viewMode === "yearly" ? goToCurrentYear : viewMode === "monthly" ? goToCurrentMonth : goToCurrentWeek}
                title={viewMode === "yearly" ? "Go to current year" : viewMode === "monthly" ? "Go to current month" : "Go to current week"}
              >
                Today
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={viewMode === "yearly" ? nextYear : viewMode === "monthly" ? nextMonth : nextWeek}
                title={viewMode === "yearly" ? "Next year" : viewMode === "monthly" ? "Next month" : "Next week"}
              >
                Next →
              </button>
            </div>
          </div>

          {/* Summary Box */}
          {selectedSplitData && (() => {
            // Calculate view income for budget purposes
            const viewIncomeTotal = viewIncomeTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
            // Use this period's actual income, or fallback to expected income (prorated if needed)
            let budgetIncome = viewIncomeTotal;
            if (viewIncomeTotal === 0 && selectedIncomeSettings?.use_expected_when_no_actual && selectedIncomeSettings?.expected_amount > 0) {
              const expectedFreq = selectedIncomeSettings.frequency;
              if (viewMode === "weekly") {
                // Prorate expected income to weekly
                budgetIncome = expectedFreq === "monthly" 
                  ? selectedIncomeSettings.expected_amount / 4.33 
                  : expectedFreq === "yearly" 
                    ? selectedIncomeSettings.expected_amount / 52 
                    : selectedIncomeSettings.expected_amount;
              } else if (viewMode === "monthly") {
                // Monthly view - prorate expected income to monthly
                budgetIncome = expectedFreq === "weekly" 
                  ? selectedIncomeSettings.expected_amount * 4.33 
                  : expectedFreq === "yearly" 
                    ? selectedIncomeSettings.expected_amount / 12 
                    : selectedIncomeSettings.expected_amount;
              } else {
                // Yearly view - prorate expected income to yearly
                budgetIncome = expectedFreq === "weekly" 
                  ? selectedIncomeSettings.expected_amount * 52 
                  : expectedFreq === "monthly" 
                    ? selectedIncomeSettings.expected_amount * 12 
                    : selectedIncomeSettings.expected_amount;
              }
            }
            const usingExpected = viewIncomeTotal === 0 && budgetIncome > 0;

            return (
            <div className="card mb-4 shadow-sm" style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--card-border)", overflowX: "auto" }}>
              <div className="card-body py-3 px-3">
                <div className="d-flex align-items-stretch gap-3" style={{ minWidth: "max-content" }}>
                  <div className="d-flex flex-column justify-content-center" style={{ minWidth: "110px", flexShrink: 0 }}>
                    <span className="fw-semibold text-primary" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.8 }}>
                      {viewMode === "yearly" ? "Yearly" : viewMode === "monthly" ? "Monthly" : "Weekly"} Summary
                    </span>
                    <span className="fw-bold" style={{ fontSize: "1.25rem" }}>£{getViewTotal.toFixed(2)}</span>
                    <span className="text-primary" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                      of £{budgetIncome.toFixed(2)} income
                      {usingExpected && <span className="badge bg-warning text-dark ms-1" style={{ fontSize: "0.65rem" }}>Est.</span>}
                    </span>
                  </div>
                  <div className="vr d-none d-sm-block" style={{ height: "50px", alignSelf: "center", flexShrink: 0 }}></div>
                  {selectedSplitData.categories.map((cat) => {
                    const categoryPurchases = getViewPurchases().filter((p) => p.category === cat.name);
                    const categoryTotal = categoryPurchases.reduce((sum, p) => sum + p.amount, 0);
                    const allocatedAmount = budgetIncome > 0 ? (budgetIncome * cat.percent) / 100 : 0;
                    const percentUsed = allocatedAmount > 0 ? (categoryTotal / allocatedAmount) * 100 : 0;
                    const remaining = allocatedAmount - categoryTotal;
                    
                    return (
                      <div key={cat.id} className="d-flex flex-column justify-content-center" style={{ minWidth: "90px", flexShrink: 0 }}>
                        <span className="text-primary fw-medium" style={{ fontSize: "0.75rem", marginBottom: "2px", whiteSpace: "nowrap", opacity: 0.8 }}>{cat.name} <span style={{ opacity: 0.7 }}>({cat.percent}%)</span></span>
                        <div className="d-flex align-items-baseline gap-1">
                          <span className="fw-bold" style={{ fontSize: "0.9rem" }}>£{categoryTotal.toFixed(2)}</span>
                          <span className="text-primary" style={{ fontSize: "0.7rem", opacity: 0.7 }}>/ £{allocatedAmount.toFixed(2)}</span>
                        </div>
                        <div className="progress" style={{ height: "4px", width: "100%", marginTop: "4px", marginBottom: "4px" }}>
                          <div
                            className={`progress-bar ${percentUsed > 100 ? "bg-danger" : percentUsed > 80 ? "bg-warning" : ""}`}
                            style={{ width: `${Math.min(percentUsed, 100)}%`, backgroundColor: percentUsed <= 80 ? "var(--tracker-budget-ok)" : undefined }}
                          />
                        </div>
                        <span className="fw-medium" style={{ fontSize: "0.7rem", whiteSpace: "nowrap", color: remaining < 0 ? "var(--bs-danger)" : "var(--tracker-budget-ok)" }}>
                          {remaining >= 0 ? `£${remaining.toFixed(2)} left` : `-£${Math.abs(remaining).toFixed(2)} over`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            );
          })()}

          <div className="row g-3">
            {/* Sidebar Toolbox */}
            <div className="col-12 col-lg-3">
              <div className="card shadow-sm mb-3">
                <div className="card-body">
                  <h6 className="mb-3">Add or Import</h6>

                  <Link
                    to="/wardeninsights"
                    className="btn btn-primary w-100 mb-2"
                    title="Add transactions or income in Warden Insights"
                  >
                    Add
                  </Link>

                  <div className="text-body small">
                    Manage all new expenses and income from Warden Insights; they’ll sync back here.
                  </div>
                </div>
              </div>


            </div>

            {/* Main Content */}
            <div className="col-12 col-lg-9">
              {/* Income Container */}
              <div className="card mb-4">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <h5 className="mb-0">Income</h5>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={openExpectedIncomeModal}
                        title="Set expected income for budgeting"
                      >
                        ⚙️ Expected
                      </button>
                    </div>
                    <span className="badge fs-6" style={{ backgroundColor: "var(--tracker-accent-bg)", color: "#000000" }}>£{viewIncomeTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0).toFixed(2)}</span>
                  </div>
                  
                  {/* Expected income info banner */}
                  {isUsingExpectedIncome && selectedIncomeSettings && (
                    <div className="alert alert-info py-2 mb-3">
                      <small>
                        📊 <strong>Using expected income:</strong> £{selectedIncomeSettings.expected_amount?.toFixed(2)}
                        {selectedIncomeSettings.next_payday && (
                          <span className="ms-2">
                            (next payday: {new Date(selectedIncomeSettings.next_payday + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })})
                          </span>
                        )}
                      </small>
                    </div>
                  )}
                  
                  {viewIncomeTransactions.length === 0 ? (
                    <div className="text-body-secondary small">No income recorded for this {viewMode === "yearly" ? "year" : viewMode === "monthly" ? "month" : "week"}.</div>
                  ) : (
                    <div className="table-responsive" style={{ maxHeight: "140px", overflowY: "auto" }}>
                      <table className="table table-sm table-hover mb-0">
                        <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                          <tr>
                            <th style={{ width: "120px" }}>Date</th>
                            <th style={{ width: "120px" }} className="text-end">Amount</th>
                            <th style={{ width: "160px" }}>Category</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewIncomeTransactions
                            .slice()
                            .sort((a, b) => toLocalDate(b.date) - toLocalDate(a.date))
                            .map((tx) => (
                              <tr key={tx.id}>
                                <td>{formatDisplayDate(tx.date)}</td>
                                <td className="text-end fw-bold">£{Number(tx.amount || 0).toFixed(2)}</td>
                                <td>
                                  <span className="badge text-bg-secondary">{tx.category || "Income"}</span>
                                </td>
                                <td className="text-body-secondary">{tx.description || "—"}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Purchases View */}
              <div className="card mb-4">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h5 className="mb-0">Purchases</h5>
                  </div>

                  {viewMode === "weekly" ? (
                    /* Weekly Spreadsheet Grid - Days as columns */
                    <div className="table-responsive" style={{ maxHeight: "320px", overflowY: "auto" }}>
                      <table className="table table-bordered mb-0" style={{ tableLayout: "fixed" }}>
                        <thead>
                          <tr>
                            {weekDays.map((day, idx) => {
                              const isToday = toDateOnlyString(day) === toDateOnlyString(new Date());
                              const dayTotal = getPurchasesForDate(day).reduce((sum, p) => sum + p.amount, 0);
                              return (
                                <th 
                                  key={idx} 
                                  className="text-center"
                                  style={{ 
                                    width: `${100/7}%`,
                                    backgroundColor: isToday ? "rgba(13, 110, 253, 0.1)" : "inherit",
                                    borderBottom: isToday ? "2px solid #0d6efd" : undefined
                                  }}
                                >
                                  <div className="fw-bold">{dayNames[idx]}</div>
                                  <div className="small text-body-secondary">
                                    {day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                  </div>
                                  {dayTotal > 0 && (
                                    <div className="badge bg-secondary mt-1">- £{dayTotal.toFixed(2)}</div>
                                  )}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {weekDays.map((day, idx) => {
                              const dayPurchases = getPurchasesForDate(day);
                              const isToday = toDateOnlyString(day) === toDateOnlyString(new Date());
                              return (
                                <td 
                                  key={idx} 
                                  className="align-top p-2"
                                  style={{ 
                                    minHeight: "200px",
                                    backgroundColor: isToday ? "rgba(13, 110, 253, 0.05)" : "inherit",
                                    verticalAlign: "top"
                                  }}
                                >
                                  {dayPurchases.length === 0 ? (
                                    <div className="text-body-secondary small text-center py-3">—</div>
                                  ) : (
                                    <div className="d-flex flex-column gap-2">
                                      {dayPurchases.map((purchase) => (
                                        <div 
                                          key={purchase.id} 
                                          className="card card-body p-2"
                                          style={{ fontSize: "0.8rem" }}
                                        >
                                          <div className="d-flex justify-content-between align-items-start mb-1">
                                            <span className="fw-bold" style={{ color: "var(--tracker-accent)" }}>£{purchase.amount.toFixed(2)}</span>
                                            <button
                                              className="btn btn-sm p-0 text-danger"
                                              onClick={() => handleDeletePurchase(purchase.id)}
                                              title="Delete"
                                              style={{ lineHeight: 1 }}
                                            >
                                              ×
                                            </button>
                                          </div>
                                          {editingPurchaseId === purchase.id ? (
                                            <select
                                              className="form-select form-select-sm mb-1"
                                              value={purchase.category}
                                              onChange={(e) => handleUpdatePurchaseCategory(purchase.id, e.target.value)}
                                              onBlur={() => setEditingPurchaseId(null)}
                                              autoFocus
                                              style={{ fontSize: "0.75rem" }}
                                            >
                                              {selectedSplitData?.categories.map((cat) => (
                                                <option key={cat.id} value={cat.name}>
                                                  {cat.name}
                                                </option>
                                              ))}
                                            </select>
                                          ) : (
                                            <button
                                              className="badge bg-primary mb-1 border-0"
                                              style={{ cursor: "pointer", fontSize: "0.7rem" }}
                                              onClick={() => setEditingPurchaseId(purchase.id)}
                                              title="Click to edit category"
                                            >
                                              {purchase.category}
                                            </button>
                                          )}
                                          {purchase.description && (
                                            <div className="text-body-secondary text-truncate" title={purchase.description}>
                                              {purchase.description}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="7" className="text-end fw-bold py-2">
                              Week Total: £{getWeekTotal.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : viewMode === "monthly" ? (
                    /* Monthly Spreadsheet Grid - Weeks as columns */
                    <div className="table-responsive" style={{ maxHeight: "400px", overflowY: "auto" }}>
                      <table className="table table-bordered mb-0" style={{ tableLayout: "fixed" }}>
                        <thead>
                          <tr>
                            {monthWeeks.map((week) => {
                              const weekPurchases = getPurchasesForWeek(week.start, week.end);
                              const weekTotal = weekPurchases.reduce((sum, p) => sum + p.amount, 0);
                              const now = new Date();
                              const isCurrentWeek = now >= week.start && now <= week.end;
                              return (
                                <th 
                                  key={week.num} 
                                  className="text-center"
                                  style={{ 
                                    width: `${100/monthWeeks.length}%`,
                                    backgroundColor: isCurrentWeek ? "rgba(13, 110, 253, 0.1)" : "inherit",
                                    borderBottom: isCurrentWeek ? "2px solid #0d6efd" : undefined
                                  }}
                                >
                                  <div className="fw-bold">{week.label}</div>
                                  <div className="small text-body-secondary">
                                    {week.start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - {week.end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                  </div>
                                  {weekTotal > 0 && (
                                    <div className="badge bg-secondary mt-1">- £{weekTotal.toFixed(2)}</div>
                                  )}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {monthWeeks.map((week) => {
                              const weekPurchases = getPurchasesForWeek(week.start, week.end);
                              const now = new Date();
                              const isCurrentWeek = now >= week.start && now <= week.end;
                              return (
                                <td 
                                  key={week.num} 
                                  className="align-top p-2"
                                  style={{ 
                                    minHeight: "200px",
                                    backgroundColor: isCurrentWeek ? "rgba(13, 110, 253, 0.05)" : "inherit",
                                    verticalAlign: "top"
                                  }}
                                >
                                  {weekPurchases.length === 0 ? (
                                    <div className="text-body-secondary small text-center py-3">—</div>
                                  ) : (
                                    <div className="d-flex flex-column gap-2">
                                      {weekPurchases
                                        .slice()
                                        .sort((a, b) => toLocalDate(b.date) - toLocalDate(a.date))
                                        .map((purchase) => (
                                        <div 
                                          key={purchase.id} 
                                          className="card card-body p-2"
                                          style={{ fontSize: "0.8rem" }}
                                        >
                                          <div className="d-flex justify-content-between align-items-start mb-1">
                                            <span className="fw-bold" style={{ color: "var(--tracker-accent)" }}>£{purchase.amount.toFixed(2)}</span>
                                            <button
                                              className="btn btn-sm p-0 text-danger"
                                              onClick={() => handleDeletePurchase(purchase.id)}
                                              title="Delete"
                                              style={{ lineHeight: 1 }}
                                            >
                                              ×
                                            </button>
                                          </div>
                                          <div className="text-body-secondary mb-1" style={{ fontSize: "0.65rem" }}>
                                            {formatDisplayDate(purchase.date)}
                                          </div>
                                          {editingPurchaseId === purchase.id ? (
                                            <select
                                              className="form-select form-select-sm mb-1"
                                              value={purchase.category}
                                              onChange={(e) => handleUpdatePurchaseCategory(purchase.id, e.target.value)}
                                              onBlur={() => setEditingPurchaseId(null)}
                                              autoFocus
                                              style={{ fontSize: "0.75rem" }}
                                            >
                                              {selectedSplitData?.categories.map((cat) => (
                                                <option key={cat.id} value={cat.name}>
                                                  {cat.name}
                                                </option>
                                              ))}
                                            </select>
                                          ) : (
                                            <button
                                              className="badge bg-primary mb-1 border-0"
                                              style={{ cursor: "pointer", fontSize: "0.7rem" }}
                                              onClick={() => setEditingPurchaseId(purchase.id)}
                                              title="Click to edit category"
                                            >
                                              {purchase.category}
                                            </button>
                                          )}
                                          {purchase.description && (
                                            <div className="text-body-secondary text-truncate" title={purchase.description}>
                                              {purchase.description}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={monthWeeks.length} className="text-end fw-bold py-2">
                              Month Total: £{getMonthTotal.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    /* Yearly Spreadsheet Grid - Months as columns */
                    <div className="table-responsive" style={{ maxHeight: "400px", overflowY: "auto" }}>
                      <table className="table table-bordered mb-0" style={{ tableLayout: "fixed" }}>
                        <thead>
                          <tr>
                            {monthNames.map((monthName, idx) => {
                              const monthPurchases = getPurchasesForMonth(idx);
                              const monthTotal = monthPurchases.reduce((sum, p) => sum + p.amount, 0);
                              const now = new Date();
                              const isCurrentMonth = now.getFullYear() === yearStart.getFullYear() && now.getMonth() === idx;
                              return (
                                <th 
                                  key={idx} 
                                  className="text-center"
                                  style={{ 
                                    width: `${100/12}%`,
                                    backgroundColor: isCurrentMonth ? "rgba(13, 110, 253, 0.1)" : "inherit",
                                    borderBottom: isCurrentMonth ? "2px solid #0d6efd" : undefined,
                                    fontSize: "0.85rem"
                                  }}
                                >
                                  <div className="fw-bold">{monthName}</div>
                                  {monthTotal > 0 && (
                                    <div className="badge bg-secondary mt-1" style={{ fontSize: "0.65rem" }}>- £{monthTotal.toFixed(2)}</div>
                                  )}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {monthNames.map((monthName, idx) => {
                              const monthPurchases = getPurchasesForMonth(idx);
                              const now = new Date();
                              const isCurrentMonth = now.getFullYear() === yearStart.getFullYear() && now.getMonth() === idx;
                              return (
                                <td 
                                  key={idx} 
                                  className="align-top p-1"
                                  style={{ 
                                    minHeight: "200px",
                                    backgroundColor: isCurrentMonth ? "rgba(13, 110, 253, 0.05)" : "inherit",
                                    verticalAlign: "top"
                                  }}
                                >
                                  {monthPurchases.length === 0 ? (
                                    <div className="text-body-secondary small text-center py-3">—</div>
                                  ) : (
                                    <div className="d-flex flex-column gap-1">
                                      {monthPurchases
                                        .slice()
                                        .sort((a, b) => toLocalDate(b.date) - toLocalDate(a.date))
                                        .slice(0, 5) // Show max 5 items per month cell
                                        .map((purchase) => (
                                        <div 
                                          key={purchase.id} 
                                          className="card card-body p-1"
                                          style={{ fontSize: "0.7rem" }}
                                        >
                                          <div className="d-flex justify-content-between align-items-start">
                                            <span className="fw-bold" style={{ color: "var(--tracker-accent)" }}>£{purchase.amount.toFixed(2)}</span>
                                            <button
                                              className="btn btn-sm p-0 text-danger"
                                              onClick={() => handleDeletePurchase(purchase.id)}
                                              title="Delete"
                                              style={{ lineHeight: 1, fontSize: "0.7rem" }}
                                            >
                                              ×
                                            </button>
                                          </div>
                                          <div className="text-body-secondary" style={{ fontSize: "0.6rem" }}>
                                            {toLocalDate(purchase.date).getDate()}/{idx + 1}
                                          </div>
                                          {editingPurchaseId === purchase.id ? (
                                            <select
                                              className="form-select form-select-sm"
                                              value={purchase.category}
                                              onChange={(e) => handleUpdatePurchaseCategory(purchase.id, e.target.value)}
                                              onBlur={() => setEditingPurchaseId(null)}
                                              autoFocus
                                              style={{ fontSize: "0.65rem" }}
                                            >
                                              {selectedSplitData?.categories.map((cat) => (
                                                <option key={cat.id} value={cat.name}>
                                                  {cat.name}
                                                </option>
                                              ))}
                                            </select>
                                          ) : (
                                            <button
                                              className="badge bg-primary border-0"
                                              style={{ cursor: "pointer", fontSize: "0.6rem" }}
                                              onClick={() => setEditingPurchaseId(purchase.id)}
                                              title="Click to edit category"
                                            >
                                              {purchase.category}
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                      {monthPurchases.length > 5 && (
                                        <div className="text-body-secondary text-center" style={{ fontSize: "0.65rem" }}>
                                          +{monthPurchases.length - 5} more
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="12" className="text-end fw-bold py-2">
                              Year Total: £{getYearTotal.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Add Purchase Modal */}
          {showAddModal && (
            <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} role="dialog">
              <div className="modal-dialog">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Add Purchase</h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setShowAddModal(false)}
                    />
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label small">Date</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={newPurchase.date}
                        onChange={(e) =>
                          setNewPurchase({ ...newPurchase, date: e.target.value })
                        }
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small">Amount (£)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control form-control-sm"
                        value={newPurchase.amount}
                        onChange={(e) =>
                          setNewPurchase({ ...newPurchase, amount: e.target.value })
                        }
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small">Category</label>
                      <select
                        className="form-select form-select-sm"
                        value={newPurchase.category}
                        onChange={(e) =>
                          setNewPurchase({ ...newPurchase, category: e.target.value })
                        }
                      >
                        <option value="">Select category…</option>
                        {selectedSplitData?.categories.map((cat) => (
                          <option key={cat.id} value={cat.name}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label small">Description (optional)</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={newPurchase.description}
                        onChange={(e) =>
                          setNewPurchase({ ...newPurchase, description: e.target.value })
                        }
                        placeholder="e.g. Tesco shopping"
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowAddModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAddPurchase}
                    >
                      Add Purchase
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Import Modal */}
          {showImportModal && (
            <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} role="dialog">
              <div className="modal-dialog modal-lg">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Import Bank Statement</h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setShowImportModal(false)}
                    />
                  </div>
                  <div className="modal-body">
                    <p className="text-body-secondary mb-3">
                      Upload your bank statement in CSV or PDF format. Transactions will be automatically categorized based on your split's categories.
                    </p>
                    <CsvPdfUpload bulkAddTransactions={handleBulkAdd} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Expected Income Modal */}
          {showExpectedIncomeModal && (
            <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <div className="modal-dialog">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Expected Income Settings</h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setShowExpectedIncomeModal(false)}
                    />
                  </div>
                  <div className="modal-body">
                    <p className="text-body-secondary mb-3">
                      Set expected income for <strong>{selectedSplit?.name || 'this split'}</strong>. 
                      This will be used for budget calculations when no actual income has been imported yet.
                    </p>
                    
                    <div className="mb-3">
                      <label className="form-label">Expected Amount (£)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={expectedIncomeForm.expected_amount}
                        onChange={(e) => setExpectedIncomeForm(prev => ({
                          ...prev,
                          expected_amount: e.target.value
                        }))}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Next Payday</label>
                      <input
                        type="date"
                        className="form-control"
                        value={expectedIncomeForm.next_payday}
                        onChange={(e) => setExpectedIncomeForm(prev => ({
                          ...prev,
                          next_payday: e.target.value
                        }))}
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Pay Frequency</label>
                      <select
                        className="form-select"
                        value={expectedIncomeForm.frequency}
                        onChange={(e) => setExpectedIncomeForm(prev => ({
                          ...prev,
                          frequency: e.target.value
                        }))}
                      >
                        <option value="weekly">Weekly</option>
                        <option value="fortnightly">Fortnightly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>

                    <div className="form-check mb-3">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="useExpectedCheckbox"
                        checked={expectedIncomeForm.use_expected_when_no_actual}
                        onChange={(e) => setExpectedIncomeForm(prev => ({
                          ...prev,
                          use_expected_when_no_actual: e.target.checked
                        }))}
                      />
                      <label className="form-check-label" htmlFor="useExpectedCheckbox">
                        Use expected income when no actual income imported
                      </label>
                    </div>

                    {selectedIncomeSettings && (
                      <div className="alert alert-info py-2 small">
                        <i className="bi bi-info-circle me-1"></i>
                        Current settings: £{Number(selectedIncomeSettings.expected_amount || 0).toFixed(2)} {selectedIncomeSettings.frequency}
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowExpectedIncomeModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSaveExpectedIncome}
                      disabled={!expectedIncomeForm.expected_amount || Number(expectedIncomeForm.expected_amount) <= 0}
                    >
                      Save Settings
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
