// npm i framer-motion
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/navbar.jsx";
import CsvPdfUpload from "../components/csv-pdf-upload.jsx";
import { useTransactions } from "../state/TransactionsContext";
import { generateId } from "../models/transaction";
import { getUserToken } from "../utils/userToken";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import "./tracker.css";

// Extracted components
import TrackerHeader from "../components/tracker/TrackerHeader.jsx";
import PeriodNavigation from "../components/tracker/PeriodNavigation.jsx";
import SummaryCard from "../components/tracker/SummaryCard.jsx";
import SidebarAddOrImportCard from "../components/tracker/SidebarAddOrImportCard.jsx";
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
  const { addTransaction, bulkAddTransactions, transactions: globalTransactions = [] } =
    useTransactions?.() ?? {};

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

  // Restore selected split from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("walletwardenSelectedSplit");
    if (saved && !selectedSplit) setSelectedSplit(saved);
  }, []);

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

  // Persist split incomes to localStorage and sync to backend
  useEffect(() => {
    if (!splitIncomesLoaded.current) return;

    try {
      localStorage.setItem("walletwardenSplitIncomes", JSON.stringify(splitIncomes));
    } catch (e) {
      console.warn("Failed to save split incomes", e);
    }

    if (!isLoading && incomesLoadedFromBackend.current && splitIncomes.length > 0) {
      const syncIncomesToBackend = async () => {
        try {
          for (const income of splitIncomes) {
            if (!income.split_id) continue;
            await fetch(`${API_URL}/purchases`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
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
          console.log("[Tracker] Synced", splitIncomes.length, "incomes to backend");
        } catch (err) {
          console.error("Error syncing incomes to backend:", err);
        }
      };
      syncIncomesToBackend();
    }
  }, [splitIncomes, isLoading]);

  // Load from backend and auto-import unlinked transactions
  useEffect(() => {
    const loadDataFromBackend = async () => {
      try {
        const splitsResponse = await fetch(`${API_URL}/splits`, {
          headers: { ...getAuthHeaders() },
        });

        let loadedSplits = [];
        let selectedSplitId = null;
        let selectedSplitData = null;
        
        if (splitsResponse.ok) {
          loadedSplits = await splitsResponse.json();
          console.log("[Tracker] Loaded splits from backend:", loadedSplits.length);
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

        const localSplits = localStorage.getItem("walletwardenSplits");
        if (localSplits) {
          const parsedLocal = JSON.parse(localSplits);
          const mergedSplits = [...loadedSplits];
          for (const localSplit of parsedLocal) {
            if (!mergedSplits.some((s) => s.id === localSplit.id)) mergedSplits.push(localSplit);
          }
          if (mergedSplits.length > loadedSplits.length) {
            setSavedSplits(mergedSplits);
            const savedSplitId = localStorage.getItem("walletwardenSelectedSplit");
            if (savedSplitId && mergedSplits.some((s) => s.id === savedSplitId)) {
              selectedSplitId = savedSplitId;
              selectedSplitData = mergedSplits.find((s) => s.id === savedSplitId);
              setSelectedSplit(savedSplitId);
            } else if (mergedSplits.length > 0 && !selectedSplit) {
              selectedSplitId = mergedSplits[0].id;
              selectedSplitData = mergedSplits[0];
              setSelectedSplit(mergedSplits[0].id);
            }
          }
        }

        const purchasesResponse = await fetch(`${API_URL}/purchases`, {
          headers: { ...getAuthHeaders() },
        });

        if (purchasesResponse.ok) {
          const allPurchases = await purchasesResponse.json();
          console.log("[Tracker] Loaded purchases from backend:", allPurchases.length);

          const incomePurchases = allPurchases.filter(
            (p) => p.category === "Income" || p.category?.toLowerCase() === "income"
          );
          const expensePurchases = allPurchases.filter(
            (p) => p.category !== "Income" && p.category?.toLowerCase() !== "income"
          );

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

        const incomeSettingsResponse = await fetch(`${API_URL}/income-settings`, {
          headers: { ...getAuthHeaders() },
        });

        if (incomeSettingsResponse.ok) {
          const allIncomeSettings = await incomeSettingsResponse.json();
          console.log("[Tracker] Loaded income settings from backend:", allIncomeSettings.length);
          setIncomeSettings(allIncomeSettings);
          incomeSettingsLoaded.current = true;
        }

        dataLoadedFromBackend.current = true;
        
        // Auto-import from Warden Insights if we have a selected split
        if (selectedSplitId && selectedSplitData) {
          console.log("[Tracker] Starting auto-import from Warden Insights...");
          await autoImportFromWardenInsights(selectedSplitId, selectedSplitData);
        }
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
      } finally {
        setIsLoading(false);
      }
    };

    loadDataFromBackend();
  }, []);



  // Normalize transactions (Warden Insights)
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

  // Filter purchases + incomes by split
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
 // ===== Hover tooltip for purchases cells =====
const [hoverTip, setHoverTip] = useState(null);

// hoverTip shape:
// { x, y, title, items: [], pinned: boolean }

const openHoverTip = (evt, title, items, pinned = false) => {
  const padding = 12;
  const tooltipWidth = 320;
  const tooltipMaxHeight = 500; // Increased to account for header + list + hint
  
  // Calculate position ensuring tooltip stays within viewport
  let x = evt.clientX + padding;
  let y = evt.clientY + padding;
  
  // Adjust horizontal position if too close to right edge
  if (x + tooltipWidth > window.innerWidth) {
    x = evt.clientX - tooltipWidth - padding;
  }
  
  // Adjust vertical position if too close to bottom edge
  if (y + tooltipMaxHeight > window.innerHeight) {
    y = Math.max(padding, window.innerHeight - tooltipMaxHeight - padding);
  }
  
  // Ensure minimum distance from edges
  x = Math.max(padding, Math.min(x, window.innerWidth - tooltipWidth - padding));
  y = Math.max(padding, y);
  
  setHoverTip({ x, y, title, items, pinned });
};

const closeHoverTip = () => setHoverTip(null);

// âœ… Close on outside click ONLY if pinned
useEffect(() => {
  const onDocMouseDown = () => {
    setHoverTip((prev) => {
      if (!prev) return prev;
      if (!prev.pinned) return prev; // hover preview stays controlled by mouseleave
      return null; // pinned closes on outside click
    });
  };

  document.addEventListener("mousedown", onDocMouseDown);
  return () => document.removeEventListener("mousedown", onDocMouseDown);
}, []);



  // Sync splits
  useEffect(() => {
    if (isLoading) return;
    const syncSplitsToBackend = async () => {
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
    };
    syncSplitsToBackend();
  }, [savedSplits, isLoading]);

  // Sync purchases
  useEffect(() => {
    if (isLoading || !purchasesLoadedFromBackend.current) return;
    const syncPurchasesToBackend = async () => {
      if (purchases.length === 0) return;
      try {
        for (const purchase of purchases) {
          if (!purchase.split_id) continue;
          await fetch(`${API_URL}/purchases`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
        console.log("[Tracker] Synced", purchases.length, "purchases to backend");
      } catch (err) {
        console.error("Error syncing purchases:", err);
      }
    };
    syncPurchasesToBackend();
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

    setPurchases((prev) => prev.map((p) => (p.id === purchaseId ? { ...p, category: newCategory } : p)));

    const purchase = purchases.find((p) => p.id === purchaseId);
    if (purchase?.description) upsertCategoryRule(purchase.description, newCategory);

    setEditingPurchaseId(null);
  };

  // Bulk add via upload
  const handleBulkAdd = (transactions) => {
    let withIds = transactions || [];
    if (Array.isArray(withIds)) withIds = withIds.map((t) => ({ ...t, id: t.id || generateId() }));

    if (typeof bulkAddTransactions === "function") bulkAddTransactions(withIds);

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
        const exactMatch = selectedSplitData?.categories.find((c) => c.name.toLowerCase() === importedLower);
        if (exactMatch) return exactMatch.name;
      }

      for (const category of selectedSplitData?.categories || []) {
        const categoryLower = category.name.toLowerCase();

        const directKeywords = keywordsByType[categoryLower];
        if (directKeywords && directKeywords.some((kw) => searchText.includes(kw))) return category.name;

        for (const [typeKey, keywords] of Object.entries(keywordsByType)) {
          if (categoryLower.includes(typeKey) || typeKey.includes(categoryLower)) {
            if (keywords.some((kw) => searchText.includes(kw))) return category.name;
          }
        }
      }

      return selectedSplitData?.categories[0]?.name || "Other";
    };

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
      setPurchases((prev) => [...prev, ...newPurchases]);

      const mostRecentDate = newPurchases.reduce((latest, p) => {
        const pDate = toLocalDate(p.date);
        return pDate > latest ? pDate : latest;
      }, toLocalDate(newPurchases[0].date));

      setCurrentDate(mostRecentDate);
      console.log("[Tracker] Added", newPurchases.length, "purchases from upload");
    }

    setShowImportModal(false);
  };

  const autoImportFromWardenInsights = async (splitId, splitData) => {
    if (!splitId || !splitData) {
      console.log("[Tracker] Skipping auto-import: no split or split data available");
      return;
    }

    const linkedTransactionIds = new Set(purchases.map((p) => p.transaction_id).filter(Boolean));
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
        const exactMatch = splitData?.categories.find((c) => c.name.toLowerCase() === importedLower);
        if (exactMatch) return exactMatch.name;
      }

      for (const category of splitData?.categories || []) {
        const categoryLower = category.name.toLowerCase();

        const directKeywords = keywordsByType[categoryLower];
        if (directKeywords && directKeywords.some((kw) => searchText.includes(kw))) return category.name;

        for (const [typeKey, keywords] of Object.entries(keywordsByType)) {
          if (categoryLower.includes(typeKey) || typeKey.includes(categoryLower)) {
            if (keywords.some((kw) => searchText.includes(kw))) return category.name;
          }
        }
      }

      return splitData?.categories[0]?.name || "Other";
    };

    const newPurchases = uniqueUnlinked.map((t) => {
      const matched = matchCategory(t.category, t.description);
      return {
        id: crypto.randomUUID(),
        split_id: splitId,
        transaction_id: t.id,
        date: toDateOnlyString(t.date),
        amount: Math.abs(Number(t.amount) || 0),
        category: matched,
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

  // View totals (for Summary + footer)
  const getWeekPurchases = useCallback(() => {
    return filteredPurchases.filter((p) => {
      const pDate = toLocalDate(p.date);
      return pDate >= weekStart && pDate <= weekEnd;
    });
  }, [filteredPurchases, weekStart, weekEnd]);

  const getWeekTotal = useMemo(() => getWeekPurchases().reduce((sum, p) => sum + p.amount, 0), [getWeekPurchases]);

  const getMonthPurchases = useCallback(() => {
    return filteredPurchases.filter((p) => {
      const pDate = toLocalDate(p.date);
      return pDate >= monthStart && pDate <= monthEnd;
    });
  }, [filteredPurchases, monthStart, monthEnd]);

  const getMonthTotal = useMemo(
    () => getMonthPurchases().reduce((sum, p) => sum + p.amount, 0),
    [getMonthPurchases]
  );

  const getYearPurchases = useCallback(() => {
    return filteredPurchases.filter((p) => {
      const pDate = toLocalDate(p.date);
      return pDate >= yearStart && pDate <= yearEnd;
    });
  }, [filteredPurchases, yearStart, yearEnd]);

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

  // =========================
  // NEW: Pivot-table helpers
  // =========================
  const splitCategoryNames = useMemo(() => {
    return (selectedSplitData?.categories || []).map((c) => c.name);
  }, [selectedSplitData]);

  const getPurchasesInRange = useCallback(
    (start, end) => {
      return filteredPurchases.filter((p) => {
        const d = toLocalDate(p.date);
        return d >= start && d <= end;
      });
    },
    [filteredPurchases]
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

  const formatMoney = (n) => `£${Number(n || 0).toFixed(2)}`;

  // alias because your tooltip uses money(...)
  const money = (n) => formatMoney(n);

  //  returns the purchases inside a cell (period range + category)
  const getCellItems = useCallback(
    (start, end, categoryName) => {
      const items = filteredPurchases
        .filter((p) => {
          const d = toLocalDate(p.date);
          return d >= start && d <= end && (p.category || "Other") === categoryName;
        })
        .sort((a, b) => toLocalDate(b.date) - toLocalDate(a.date))
        .map((p) => ({
          id: p.id,
          description: p.description || "–",
          amount: Number(p.amount) || 0,
        }));

      return items;
    },
    [filteredPurchases]
  );

  return (
    <div className="container-fluid py-4 mt-5" style={{ maxWidth: "100%", minHeight: "100vh" }}>

      <Navbar />

      <TrackerHeader
        savedSplits={savedSplits}
        selectedSplit={selectedSplit}
        setSelectedSplit={setSelectedSplit}
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
              <SidebarAddOrImportCard prefersReducedMotion={prefersReducedMotion} />

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
                hoverTip={hoverTip}
                openHoverTip={openHoverTip}
                closeHoverTip={closeHoverTip}
                getViewTotal={getViewTotal}
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
