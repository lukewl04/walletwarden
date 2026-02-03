// src/views/WardenInsights.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CsvPdfUpload from "../components/csv-pdf-upload.jsx";
import Navbar from "../components/navbar.jsx";
import HelpPanel from "../components/help-panel.jsx";
import { useTransactions } from "../state/TransactionsContext";
import { TRANSACTION_CATEGORIES } from "../utils/categories";
import { getUserToken } from "../utils/userToken";

import Donut from "../components/charts/Donut.jsx";
import LineChart from "../components/charts/LineChart.jsx";
import Bars from "../components/charts/Bars.jsx";

export default function WardenInsights() {
  const location = useLocation();
  const navigate = useNavigate();
  const shouldShowHelp =
    location.state?.showHelp || localStorage.getItem("walletwarden-show-help");

  const {
    transactions = [],
    totals: globalTotals,
    addTransaction,
    bulkAddTransactions,
    updateTransaction,
    refreshTransactions,
  } = useTransactions();

  const categories = TRANSACTION_CATEGORIES;

  // UI state
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [postConnectRunning, setPostConnectRunning] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [description, setDescription] = useState("");

  // Insights controls - unified time filter: "3m" | "6m" | "12m" | "cumulative"
  const [timeFilter, setTimeFilter] = useState("cumulative");
  const [showInsightsDetails, setShowInsightsDetails] = useState(true);
  
  // Derived values from unified time filter
  const showCumulative = timeFilter === "cumulative";
  const monthsBack = timeFilter === "cumulative" ? 12 : parseInt(timeFilter, 10);
  const [transactionFilter, setTransactionFilter] = useState(30);

  // Bank state
  const [bankStatus, setBankStatus] = useState(null); // null = unknown/loading
  const bankStatusLoading = bankStatus === null;

  const [bankLoading, setBankLoading] = useState(false);
  const [bankSyncing, setBankSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState("");

  // Balance state
  const [displayBalance, setDisplayBalance] = useState(null);
  const [bankBalance, setBankBalance] = useState(null);

  // Stored balance from Supabase (used when TrueLayer is disconnected)
  const [storedBalance, setStoredBalance] = useState(null);
  const [storedBalanceLoading, setStoredBalanceLoading] = useState(true);

  const autoSyncHasRun = useRef(false);
  const handledCallbackRef = useRef(false);

  const API_URL = "http://localhost:4000/api";
  const getAuthHeaders = () => ({ Authorization: `Bearer ${getUserToken()}` });

  // Live balance loading flag
  const [liveBalanceLoading, setLiveBalanceLoading] = useState(false);

  // Fetch LIVE bank balance
  const fetchBankBalance = async () => {
    setLiveBalanceLoading(true);
    try {
      const res = await fetch(`${API_URL}/banks/truelayer/balance`, {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = await res.json();
      const tb = data?.totalBalance;
      if (typeof tb !== "number" || !Number.isFinite(tb)) return;

      setDisplayBalance(data);
      setBankBalance(data);
    } catch (err) {
      console.error("Failed to fetch bank balance:", err);
    } finally {
      setLiveBalanceLoading(false);
    }
  };

  // Fetch stored balance from Supabase (used when TrueLayer is disconnected)
  const fetchStoredBalance = async () => {
    setStoredBalanceLoading(true);
    try {
      const res = await fetch(`${API_URL}/banks/truelayer/balance-cached`, {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        setStoredBalanceLoading(false);
        return;
      }

      const data = await res.json();
      const tb = data?.totalBalance;

      if (typeof tb === "number" && Number.isFinite(tb)) {
        setStoredBalance({
          totalBalance: data.totalBalance,
          availableBalance: data.availableBalance,
          currency: data.currency,
          lastSyncedAt: data.lastSyncedAt,
        });
      }
    } catch (e) {
      console.error("Failed to fetch stored balance:", e);
    } finally {
      setStoredBalanceLoading(false);
    }
  };



  // Sync bank transactions
  const handleSyncBank = async (silent = false, force = false) => {
    if ((!bankStatus?.connected && !force) || bankSyncing) return;

    setBankSyncing(true);
    if (!silent) setLastSyncMessage("");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(`${API_URL}/banks/truelayer/sync`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.requiresReconnect || res.status === 401) {
          setBankStatus({ connected: false });
          if (!silent)
            setLastSyncMessage("Bank connection expired. Please reconnect.");
          return;
        }
        throw new Error(err.message || "Sync failed");
      }

      const result = await res.json();

      if (result.inserted > 0) {
        setLastSyncMessage(
          `Synced ${result.accounts} account(s): ${result.inserted} new, ${
            result.skipped || 0
          } existing`
        );
      } else if (result.accounts > 0) {
        setLastSyncMessage(
          `Updated ${result.accounts} account balance(s). To sync new transactions, reconnect your bank.`
        );
      } else {
        setLastSyncMessage("No updates available.");
      }

      await refreshTransactions();
      await fetchBankBalance();
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Sync error:", err);
      if (err.name === "AbortError") {
        if (!silent) setLastSyncMessage("Sync timed out. Try again later.");
      } else {
        if (!silent) setLastSyncMessage(`Sync failed: ${err.message}`);
      }
    } finally {
      setBankSyncing(false);
    }
  };

  // Mount: resolve bank connection + handle callback
  useEffect(() => {
    setBankLoading(false);
    setBankStatus(null);

    // start blank (prevents cached flash)
    setDisplayBalance(null);
    setBankBalance(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const checkBankStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/banks/truelayer/status`, {
          headers: getAuthHeaders(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          setBankStatus({ connected: false });
          await fetchStoredBalance(); // Fetch stored balance from Supabase
          return;
        }

        const data = await res.json();
        const connected = !!data.connected;
        setBankStatus({ connected });

        if (connected) {
          await fetchBankBalance(); // LIVE only
        } else {
          await fetchStoredBalance(); // Stored balance from Supabase
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name !== "AbortError") console.error("status error:", err);

        setBankStatus({ connected: false });
        await fetchStoredBalance(); // Fetch stored balance from Supabase
      }
    };

    // OAuth callback param handling
    const params = new URLSearchParams(location.search);
    if (import.meta.env.DEV) console.debug("[WardenInsights] callback params", location.search);
    
    if ((params.has("bankConnected") || params.has("syncing")) && !handledCallbackRef.current) {
      handledCallbackRef.current = true;
      
      // Clean URL immediately using React Router (no reload)
      navigate(location.pathname, { replace: true });
      
      (async () => {
        setPostConnectRunning(true);
        try {
          autoSyncHasRun.current = true;

          setBankStatus({ connected: true });
          setLastSyncMessage("Bank connected! Getting balance…");

          // live first (prevents cached flash)
          await Promise.allSettled([fetchBankBalance(), refreshTransactions()]);

          setLastSyncMessage("Bank connected ✅ Syncing in background…");

          // background sync
          handleSyncBank(true, true).catch((err) => {
            console.error("Post-connect sync failed:", err);
            setLastSyncMessage(
              "Bank connected ✅ (background sync failed — hit 🔄 to retry)"
            );
          });
        } finally {
          setPostConnectRunning(false);
        }
      })();

      return () => {
        clearTimeout(timeoutId);
        controller.abort();
      };
    }

    // normal load
    checkBankStatus();

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync when bank is connected (runs once)
  useEffect(() => {
    if (bankStatus?.connected && !bankStatusLoading && !autoSyncHasRun.current) {
      autoSyncHasRun.current = true;
      handleSyncBank(true);
    }
  }, [bankStatus?.connected, bankStatusLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnectBank = async () => {
    setBankLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`${API_URL}/banks/truelayer/connect`, {
        headers: getAuthHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${res.status}`);
      }

      const data = await res.json();
      if (!data.url) throw new Error("No redirect URL received from server");

      window.location.href = data.url;
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Connect bank error:", err);

      if (err.name === "AbortError") {
        alert(
          "Connection timed out. Please check your internet connection and try again."
        );
      } else {
        alert(err.message || "Failed to connect bank. Please try again.");
      }
      setBankLoading(false);
    }
  };

  const isBankConnected = bankStatus?.connected === true;
  const isBankDisconnected = bankStatus?.connected === false;

  const hasLiveBankNumber = Number.isFinite(displayBalance?.totalBalance);
  const hasStoredBalance = Number.isFinite(storedBalance?.totalBalance);

  // Loading state - stop loading once we've checked for stored balance (even if none found)
  const balanceIsLoading =
    bankStatusLoading ||
    (isBankConnected && (liveBalanceLoading || !hasLiveBankNumber)) ||
    (isBankDisconnected && storedBalanceLoading);

  // Use live balance if connected, otherwise use stored balance from Supabase
  const balanceValue =
    hasLiveBankNumber
      ? displayBalance?.totalBalance
      : hasStoredBalance
      ? storedBalance.totalBalance
      : null;

  // Check if we have no balance data at all (disconnected and no stored balance)
  const noBalanceAvailable = isBankDisconnected && !storedBalanceLoading && !hasStoredBalance;

  const isNegative = !balanceIsLoading && Number(balanceValue ?? 0) < 0;

  const formattedBalance = useMemo(() => {
    if (balanceIsLoading) return "Loading…";
    if (noBalanceAvailable) return "—";
    if (balanceValue === null) return "—";
    const b = Number(balanceValue ?? 0);
    const sign = b < 0 ? "-" : "";
    return `${sign}£${Math.abs(b).toFixed(2)}`;
  }, [balanceIsLoading, balanceValue, noBalanceAvailable]);

  const handleAddTransaction = (type) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;

    const normalizedType =
      (type || "expense").toLowerCase() === "income" ? "income" : "expense";

    if (typeof addTransaction !== "function") return;

    addTransaction({
      id: Date.now(),
      type: normalizedType,
      amount: value,
      date: new Date().toISOString(),
      category: category || "Other",
      description: description || "",
    });

    setAmount("");
    setCategory("Other");
    setDescription("");
  };

  // ---- analytics parsing ----
  const safeParseDate = (input) => {
    if (input instanceof Date && !isNaN(input)) return input;
    if (!input) return new Date();

    let d = new Date(input);
    if (!isNaN(d)) return d;

    const stripped = String(input).replace(/(\d+)(st|nd|rd|th)/gi, "$1").trim();
    d = new Date(`${stripped} ${new Date().getFullYear()}`);
    if (!isNaN(d)) return d;

    return new Date();
  };

  const parsed = useMemo(() => {
    return (transactions || []).map((t) => {
      const date = safeParseDate(t.date);
      const amt = Number(t.amount) || 0;
      const type =
        (t.type || "expense").toLowerCase() === "income" ? "income" : "expense";
      const desc = (t.description || "").trim();
      const source = t.source || "manual";
      return { ...t, date, amount: amt, type, description: desc, source };
    });
  }, [transactions]);

  // When bank is connected, only use bank transactions for charts (to avoid double-counting old CSV imports)
  const chartTransactions = useMemo(() => {
    if (isBankConnected && parsed.length > 0) {
      const bankTxs = parsed.filter((t) => t.source === "bank");
      return bankTxs.length > 0 ? bankTxs : parsed;
    }
    return parsed;
  }, [parsed, isBankConnected]);

  const recentSorted = useMemo(() => {
    return [...parsed].sort((a, b) => {
      const da = a.date?.getTime?.() ?? new Date(a.date).getTime();
      const db = b.date?.getTime?.() ?? new Date(b.date).getTime();
      if (db !== da) return db - da;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [parsed]);

  // Filter recent transactions by time range
  const filteredRecentTransactions = useMemo(() => {
    if (transactionFilter === null) return recentSorted;

    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - transactionFilter);

    return recentSorted.filter((t) => {
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      return txDate >= cutoffDate;
    });
  }, [recentSorted, transactionFilter]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    chartTransactions.forEach((t) => {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    });
    return { income, expense };
  }, [chartTransactions]);

  const monthly = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      months.push({
        key,
        date: d,
        label: d.toLocaleString(undefined, { month: "short", year: "2-digit" }),
      });
    }

    const map = {};
    months.forEach((m) => (map[m.key] = { income: 0, expense: 0 }));

    chartTransactions.forEach((t) => {
      const key = t.date.toISOString().slice(0, 7);
      if (!map[key]) return;
      if (t.type === "income") map[key].income += t.amount;
      else map[key].expense += t.amount;
    });

    const list = months.map((m) => ({
      ...m,
      ...map[m.key],
      net: map[m.key].income - map[m.key].expense,
    }));

    if (!showCumulative) return list;

    let cum = 0;
    return list.map((l) => {
      cum += l.net;
      return { ...l, cum };
    });
  }, [chartTransactions, monthsBack, showCumulative]);

  const topExpenses = useMemo(() => {
    const buckets = [
      {
        key: "Food",
        re: /\b(grocer|supermarket|restaurant|cafe|takeaway|food|tesco|aldi|lidl|sainsbury|co-op|waitrose)\b/i,
      },
      { key: "Petrol", re: /\b(petrol|fuel|esso|shell|bp|texaco)\b/i },
      {
        key: "Subscriptions",
        re: /\b(netflix|spotify|prime|subscription|membership|apple|google play)\b/i,
      },
      { key: "Transport", re: /\b(uber|taxi|train|bus|tube|tram|ticket)\b/i },
      {
        key: "Bills",
        re: /\b(bill|electric|gas|water|utility|broadband|rent|mortgage|insurance)\b/i,
      },
      {
        key: "Shopping",
        re: /\b(amazon|asos|zara|hm|argos|boots|currys|clothing|shop)\b/i,
      },
      { key: "Entertainment", re: /\b(cinema|theatre|concert|event|museum|game)\b/i },
      { key: "Savings", re: /\b(savings|save|deposit|isa|pot)\b/i },
      { key: "Other", re: /./i },
    ];

    const map = {};
    chartTransactions.forEach((t) => {
      if (t.type !== "expense") return;

      let key = null;

      if (t.category) {
        const found = buckets.find(
          (b) => b.key.toLowerCase() === String(t.category).toLowerCase()
        );
        if (found) key = found.key;
      }

      if (!key) {
        const desc = (t.description || "").toLowerCase();
        const found = buckets.find((b) => b.re.test(desc));
        key = found?.key || "Other";
      }

      map[key] = (map[key] || 0) + t.amount;
    });

    return Object.entries(map)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [chartTransactions]);

  const topMerchants = useMemo(() => {
    const map = {};
    chartTransactions.forEach((t) => {
      if (t.type !== "expense" || !t.description) return;
      const vendor = t.description
        .split(/[\s-]/)
        .slice(0, 2)
        .join(" ")
        .substring(0, 30);
      map[vendor] = (map[vendor] || 0) + t.amount;
    });

    return Object.entries(map)
      .map(([vendor, amount]) => ({ vendor, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [chartTransactions]);

  const spendingForecast = useMemo(() => {
    if (monthly.length === 0) return null;

    const lastMonth = monthly[monthly.length - 1];
    const avgMonthly =
      monthly.reduce((sum, m) => sum + m.expense, 0) / monthly.length;

    const last3Avg =
      monthly.slice(-3).reduce((sum, m) => sum + m.expense, 0) /
      Math.min(3, monthly.length);

    return {
      lastMonth: lastMonth.expense,
      average: avgMonthly,
      forecast: last3Avg,
      trend: last3Avg > avgMonthly ? "increasing" : "decreasing",
    };
  }, [monthly]);

  // Calculate potential savings by category
  const potentialSavings = useMemo(() => {
    const buckets = [
      {
        key: "Cigarettes/Tobacco",
        re: /\b(cigarette|tobacco|smoke|vape|nicotine|cigar)\b/i,
        description: "Stop smoking",
      },
      {
        key: "Coffee",
        re: /\b(coffee|cafe|espresso|latte|cappuccino|starbucks)\b/i,
        description: "Skip daily coffee",
      },
      {
        key: "Subscriptions",
        re: /\b(netflix|spotify|prime|subscription|membership|apple|google play|disney)\b/i,
        description: "Cancel unused subscriptions",
      },
      {
        key: "Takeaway/Delivery",
        re: /\b(uber eats|deliveroo|just eat|grubhub|takeaway|delivery)\b/i,
        description: "Cook at home",
      },
      {
        key: "Impulse Purchases",
        re: /\b(amazon|asos|online shopping|clothes|shopping)\b/i,
        description: "Reduce online shopping",
      },
    ];

    const map = {};
    chartTransactions.forEach((t) => {
      if (t.type !== "expense") return;

      const desc = (t.description || "").toLowerCase();
      const found = buckets.find((b) => b.re.test(desc));

      if (found) {
        if (!map[found.key]) {
          map[found.key] = {
            amount: 0,
            description: found.description,
            count: 0,
          };
        }
        map[found.key].amount += t.amount;
        map[found.key].count += 1;
      }
    });

    return Object.entries(map)
      .map(([category, data]) => ({
        category,
        ...data,
        monthlyAvg: data.amount / Math.max(1, monthsBack),
        yearlyPotential: (data.amount / Math.max(1, monthsBack)) * 12,
      }))
      .sort((a, b) => b.yearlyPotential - a.yearlyPotential)
      .slice(0, 5);
  }, [chartTransactions, monthsBack]);

  return (
    <div
      className="container-fluid py-4 mt-5"
      style={{ maxWidth: 900, minHeight: "100vh", overflowY: "auto" }}
    >
      <Navbar />
      {shouldShowHelp && <HelpPanel />}

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex align-items-start justify-content-between mb-3">
            <div>
              <h2 className="h5 mb-1">Warden Dashboard</h2>
              <p className="text-muted small mb-0">
                Everything from the old homepage lives here now.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {bankStatus?.connected && (
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => handleSyncBank(false)}
                  disabled={bankSyncing}
                  title="Refresh bank transactions"
                  style={{ fontSize: "1.1rem", padding: "0.25rem 0.5rem" }}
                >
                  {bankSyncing ? (
                    <span
                      className="spinner-border spinner-border-sm"
                      role="status"
                      aria-hidden="true"
                    ></span>
                  ) : (
                    "🔄"
                  )}
                </button>
              )}

              <div className="segmented-control">
                <button
                  className={`segmented-control__segment ${timeFilter === "3m" ? "segmented-control__segment--active" : ""}`}
                  onClick={() => setTimeFilter("3m")}
                >
                  3m
                </button>
                <button
                  className={`segmented-control__segment ${timeFilter === "6m" ? "segmented-control__segment--active" : ""}`}
                  onClick={() => setTimeFilter("6m")}
                >
                  6m
                </button>
                <button
                  className={`segmented-control__segment ${timeFilter === "12m" ? "segmented-control__segment--active" : ""}`}
                  onClick={() => setTimeFilter("12m")}
                >
                  12m
                </button>
                <button
                  className={`segmented-control__segment ${timeFilter === "cumulative" ? "segmented-control__segment--active" : ""}`}
                  onClick={() => setTimeFilter("cumulative")}
                >
                  Cumulative
                </button>
              </div>
            </div>
          </div>

          {(bankSyncing || lastSyncMessage) && (
            <div
              className={`alert ${
                lastSyncMessage.includes("failed") ||
                lastSyncMessage.includes("expired")
                  ? "alert-warning"
                  : "alert-info"
              } py-2 mb-3`}
            >
              <small>
                {bankSyncing ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Syncing bank transactions...
                  </>
                ) : (
                  lastSyncMessage
                )}
              </small>
            </div>
          )}

          {/* Balance */}
          <div className="card shadow-sm mb-3">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between gap-3">
                <div>
                  <div className="text-muted small">
                    {isBankConnected
                      ? "Bank Balance"
                      : hasStoredBalance
                      ? "Last Synced Balance"
                      : "Balance"}

                    {isBankConnected && hasLiveBankNumber && !balanceIsLoading && (
                      <span
                        className="badge bg-info ms-2"
                        style={{ fontSize: "0.65rem" }}
                      >
                        Live
                      </span>
                    )}

                    {!isBankConnected && hasStoredBalance && (
                      <span
                        className="badge bg-secondary ms-2"
                        style={{ fontSize: "0.65rem" }}
                      >
                        Stored
                      </span>
                    )}
                  </div>

                  <div
                    className={`display-6 mb-0 ${
                      balanceIsLoading || noBalanceAvailable
                        ? "text-muted"
                        : isNegative
                        ? "text-danger"
                        : "text-success"
                    }`}
                  >
                    {formattedBalance}
                  </div>

                  {noBalanceAvailable && (
                    <div className="text-muted small mt-1">
                      Connect your bank to see your balance
                    </div>
                  )}

                  {isBankConnected &&
                    !balanceIsLoading &&
                    Number.isFinite(bankBalance?.availableBalance) &&
                    Number.isFinite(bankBalance?.totalBalance) &&
                    Math.abs(
                      bankBalance.availableBalance - bankBalance.totalBalance
                    ) > 0.01 && (
                      <div className="text-muted small mt-1">
                        Available: £{bankBalance.availableBalance.toFixed(2)}
                      </div>
                    )}
                </div>

                <span
                  className={`badge rounded-pill ${
                    balanceIsLoading || noBalanceAvailable
                      ? "text-bg-secondary"
                      : isNegative
                      ? "text-bg-danger"
                      : "text-bg-success"
                  }`}
                >
                  {balanceIsLoading
                    ? "Loading…"
                    : noBalanceAvailable
                    ? "No data"
                    : isNegative
                    ? "Over budget"
                    : "Looking good"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Add */}
          <div className="card shadow-sm mb-3">
            <div className="card-body">
              <button
                className="segmented-control__segment segmented-control__segment--active w-100"
                style={{ borderRadius: '24px', padding: '10px 14px', fontSize: '1rem' }}
                onClick={() => setShowQuickAddModal(true)}
              >
                💬 Quick Add
              </button>
            </div>
          </div>

          {/* Import / Bank connect - Only show if bank is NOT connected */}
          {!bankStatus?.connected && (
            <div className="card shadow-sm mb-3">
              <div className="card-body py-2 px-3">
                <h2 className="h6 mb-1" style={{ fontSize: '0.9rem' }}>Import Transactions</h2>
                <p className="text-muted mb-2" style={{ fontSize: '0.75rem' }}>
                  Upload your bank statements in CSV or PDF format, or connect your bank directly
                </p>

                <div className="d-flex gap-2">
                  <button
                    className="segmented-control__segment segmented-control__segment--active flex-fill"
                    style={{ borderRadius: '20px', padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => setShowImportModal(true)}
                  >
                    📄 CSV/PDF
                  </button>

                  {bankStatusLoading ? (
                    <button
                      className="segmented-control__segment segmented-control__segment--active flex-fill"
                      style={{ borderRadius: '20px', padding: '6px 12px', fontSize: '0.8rem' }}
                      disabled
                    >
                      <span
                        className="spinner-border spinner-border-sm me-1"
                        style={{ width: '0.7rem', height: '0.7rem' }}
                        role="status"
                        aria-hidden="true"
                      ></span>
                      Checking...
                    </button>
                  ) : (
                    <button
                      className="segmented-control__segment segmented-control__segment--active flex-fill"
                      style={{ borderRadius: '20px', padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={handleConnectBank}
                      disabled={bankLoading}
                    >
                      {bankLoading ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-1"
                            style={{ width: '0.7rem', height: '0.7rem' }}
                            role="status"
                            aria-hidden="true"
                          ></span>
                          Connecting...
                        </>
                      ) : (
                        "🏦 Open Banking"
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Charts */}
          {parsed.length === 0 ? (
            <div className="text-muted">
              No transactions to show. Import some transactions to see insights.
            </div>
          ) : (
            <div className="row g-3 mb-3">
              <div className="col-12 col-md-4 d-flex align-items-center justify-content-center">
                <Donut income={totals.income} expense={totals.expense} />
              </div>

              <div className="col-12 col-md-8">
                <div className="card p-2" style={{ height: 220 }}>
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <small className="text-muted">
                      {showCumulative ? "Cumulative balance" : "Net per month"}
                    </small>
                    <small className="text-muted">{monthsBack} months</small>
                  </div>
                  <div style={{ width: "100%", height: 160 }}>
                    <LineChart
                      data={monthly}
                      showCumulative={showCumulative}
                      width={600}
                      height={160}
                    />
                  </div>
                </div>
              </div>

              {/* Toggle button for insights details */}
              <div className="d-flex justify-content-center mb-3">
                <button
                  className="segmented-control__segment segmented-control__segment--active"
                  style={{ borderRadius: '24px', padding: '10px 14px', fontSize: '1rem' }}
                  onClick={() => setShowInsightsDetails(!showInsightsDetails)}
                  title={
                    showInsightsDetails
                      ? "Hide insights details"
                      : "Show insights details"
                  }
                >
                  {showInsightsDetails ? "▼ Hide Insights" : "▶ Show Insights"}
                </button>
              </div>

              {/* Collapsible insights sections */}
              {showInsightsDetails && (
                <>
                  <div className="row g-3 mb-3">
                    <div className="col-12 col-lg-6">
                      <div className="card p-2">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <div>
                            <strong>Top Expense Categories</strong>
                            <div className="text-muted small">Largest buckets</div>
                          </div>
                          <div className="text-muted small">{topExpenses.length}</div>
                        </div>

                        {topExpenses.length === 0 ? (
                          <div className="text-muted">No expense data available.</div>
                        ) : (
                          <div style={{ minHeight: 220 }}>
                            <Bars items={topExpenses} width={400} height={180} />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="col-12 col-lg-6">
                      <div className="card p-2">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <div>
                            <strong>Top Merchants & Vendors</strong>
                            <div className="text-muted small">Where you spend most</div>
                          </div>
                          <div className="text-muted small">{topMerchants.length}</div>
                        </div>

                        {topMerchants.length === 0 ? (
                          <div className="text-muted">No merchant data available.</div>
                        ) : (
                          <div style={{ minHeight: 220 }}>
                            <Bars
                              items={topMerchants.map((m) => ({
                                category: m.vendor,
                                amount: m.amount,
                              }))}
                              width={400}
                              height={180}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {spendingForecast && (
                    <div className="card p-3 mb-3">
                      <div className="mb-3">
                        <strong>Spending Forecast</strong>
                        <div className="text-muted small">Next month projection</div>
                      </div>

                      <div className="row g-3">
                        <div className="col-12 col-sm-6">
                          <div
                            className="p-3 rounded"
                            style={{
                              backgroundColor: "var(--card-border)",
                              color: "var(--text)",
                            }}
                          >
                            <div className="text-muted small mb-1">Forecast</div>
                            <div className="h5 mb-0 text-primary">
                              £{spendingForecast.forecast.toFixed(2)}
                            </div>
                            <small className="text-muted d-block">
                              Based on last 3 months avg
                            </small>
                          </div>
                        </div>

                        <div className="col-12 col-sm-6">
                          <div
                            className="p-3 rounded"
                            style={{
                              backgroundColor: "var(--card-border)",
                              color: "var(--text)",
                            }}
                          >
                            <div className="text-muted small mb-1">Trend</div>
                            <div
                              className={`h5 mb-0 ${
                                spendingForecast.trend === "increasing"
                                  ? "text-danger"
                                  : "text-success"
                              }`}
                            >
                              {spendingForecast.trend === "increasing"
                                ? "📈 Increasing"
                                : "📉 Decreasing"}
                            </div>
                            <small className="text-muted d-block">
                              vs historical average (£{spendingForecast.average.toFixed(2)})
                            </small>
                          </div>
                        </div>

                        <div className="col-12 col-sm-6">
                          <div
                            className="p-3 rounded"
                            style={{
                              backgroundColor: "var(--card-border)",
                              color: "var(--text)",
                            }}
                          >
                            <div className="text-muted small mb-1">Last Month</div>
                            <div className="h5 mb-0">
                              £{spendingForecast.lastMonth.toFixed(2)}
                            </div>
                            <small className="text-muted d-block">Actual spending</small>
                          </div>
                        </div>

                        <div className="col-12 col-sm-6">
                          <div
                            className="p-3 rounded"
                            style={{
                              backgroundColor: "var(--card-border)",
                              color: "var(--text)",
                            }}
                          >
                            <div className="text-muted small mb-1">Average</div>
                            <div className="h5 mb-0">
                              £{spendingForecast.average.toFixed(2)}
                            </div>
                            <small className="text-muted d-block">
                              Over {monthsBack} months
                            </small>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {potentialSavings.length > 0 && (
                    <div className="card p-2 mb-3">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div>
                          <strong style={{ fontSize: '0.9rem' }}>💰 Where You Could Save</strong>
                          <span className="text-muted ms-2" style={{ fontSize: '0.7rem' }}>
                            Annual savings potential
                          </span>
                        </div>
                        <div className="text-success" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                          £{potentialSavings.reduce((sum, item) => sum + item.yearlyPotential, 0).toFixed(0)}/yr
                        </div>
                      </div>

                      <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {potentialSavings.map((item, idx) => (
                          <div
                            key={idx}
                            className="d-flex align-items-center justify-content-between py-1 px-2"
                            style={{
                              backgroundColor: idx % 2 === 0 ? "rgba(220, 53, 69, 0.04)" : "transparent",
                              borderLeft: "2px solid #dc3545",
                              marginBottom: '2px',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{item.category}</span>
                              <span className="text-muted ms-2" style={{ fontSize: '0.65rem' }}>{item.description}</span>
                            </div>
                            <div className="d-flex align-items-center gap-3 text-end" style={{ fontSize: '0.75rem' }}>
                              <div>
                                <span className="text-muted">£</span>
                                <span className="text-warning">{item.monthlyAvg.toFixed(0)}</span>
                                <span className="text-muted">/mo</span>
                              </div>
                              <div style={{ minWidth: '55px' }}>
                                <span className="text-muted">£</span>
                                <span className="text-danger fw-semibold">{item.yearlyPotential.toFixed(0)}</span>
                                <span className="text-muted">/yr</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Recent Transactions */}
          <div className="card shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h6 mb-0">Recent Transactions</h2>
                <span className="text-muted small">
                  {filteredRecentTransactions.length} / {transactions.length} total
                </span>
              </div>

              {/* Time range filter buttons */}
              <div className="segmented-control mb-3">
                <button
                  className={`segmented-control__segment ${
                    transactionFilter === 7 ? "segmented-control__segment--active" : ""
                  }`}
                  onClick={() => setTransactionFilter(7)}
                >
                  7d
                </button>
                <button
                  className={`segmented-control__segment ${
                    transactionFilter === 30 ? "segmented-control__segment--active" : ""
                  }`}
                  onClick={() => setTransactionFilter(30)}
                >
                  1m
                </button>
                <button
                  className={`segmented-control__segment ${
                    transactionFilter === 180 ? "segmented-control__segment--active" : ""
                  }`}
                  onClick={() => setTransactionFilter(180)}
                >
                  6m
                </button>
                <button
                  className={`segmented-control__segment ${
                    transactionFilter === 365 ? "segmented-control__segment--active" : ""
                  }`}
                  onClick={() => setTransactionFilter(365)}
                >
                  1y
                </button>
                <button
                  className={`segmented-control__segment ${
                    transactionFilter === null ? "segmented-control__segment--active" : ""
                  }`}
                  onClick={() => setTransactionFilter(null)}
                >
                  All
                </button>
              </div>

              {transactions.length === 0 ? (
                <div className="text-muted">No transactions yet</div>
              ) : filteredRecentTransactions.length === 0 ? (
                <div className="text-muted">No transactions in this time range</div>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <ul className="list-group">
                  {filteredRecentTransactions.map((t) => (
                    <li key={t.id} className="list-group-item">
                      <div className="d-flex align-items-start justify-content-between gap-2">
                        <div style={{ flex: 1 }}>
                          <div className="d-flex align-items-center gap-2 mb-2">
                            <span
                              className={
                                t.type === "income"
                                  ? "text-success fw-semibold"
                                  : "text-danger fw-semibold"
                              }
                            >
                              {t.type === "income" ? "+ " : "− "}£
                              {Number(t.amount).toFixed(2)}
                            </span>

                            {editingCategoryId === t.id ? (
                              <select
                                className="form-select form-select-sm"
                                style={{ width: "150px", fontSize: "0.85rem" }}
                                value={t.category || "Other"}
                                onChange={(e) => {
                                  updateTransaction(t.id, { category: e.target.value });
                                  setEditingCategoryId(null);
                                }}
                                autoFocus
                                onBlur={() => setEditingCategoryId(null)}
                              >
                                {categories.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <button
                                className="badge bg-secondary"
                                style={{
                                  fontSize: "0.75rem",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: "0.4rem 0.6rem",
                                }}
                                onClick={() => setEditingCategoryId(t.id)}
                                title="Click to edit category"
                              >
                                {t.category || "Other"}
                              </button>
                            )}
                          </div>

                          {t.description && (
                            <div className="text-light small" style={{ fontSize: "0.85rem" }}>
                              {t.description}
                            </div>
                          )}
                        </div>

                        <span className="text-muted small ms-3" style={{ whiteSpace: "nowrap" }}>
                          {t.date.toLocaleDateString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                </div>
              )}
            </div>
          </div>

          {/* Import Modal */}
          {showImportModal && (
            <div
              className="modal d-block"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
              role="dialog"
            >
              <div className="modal-dialog modal-lg" role="document">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Import Bank Statement</h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setShowImportModal(false)}
                    ></button>
                  </div>
                  <div className="modal-body">
                    <CsvPdfUpload
                      onSave={bulkAddTransactions}
                      onClose={() => setShowImportModal(false)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Add Modal */}
          {showQuickAddModal && (
            <div
              className="modal d-block"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
              role="dialog"
            >
              <div className="modal-dialog" role="document">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Quick Add Transaction</h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setShowQuickAddModal(false)}
                    ></button>
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Amount (£)</label>
                      <input
                        className="form-control"
                        type="number"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        step="0.01"
                        min="0"
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Category</label>
                      <select
                        className="form-select"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Description (optional)</label>
                      <input
                        className="form-control"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Tesco / Rent / Salary"
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowQuickAddModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={() => {
                        handleAddTransaction("income");
                        setShowQuickAddModal(false);
                      }}
                    >
                      + Income
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        handleAddTransaction("expense");
                        setShowQuickAddModal(false);
                      }}
                    >
                      − Expense
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
