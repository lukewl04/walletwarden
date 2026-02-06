// src/hooks/useTrueLayerBanking.js
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Extracts all TrueLayer / Open-Banking state, effects, and handlers
 * out of WardenInsights so the view stays presentation-only.
 *
 * @param {object} opts
 * @param {string}   opts.API_URL
 * @param {function} opts.getAuthHeaders   – () => { Authorization: "Bearer …" }
 * @param {object}   opts.location         – react-router location
 * @param {function} opts.navigate         – react-router navigate
 * @param {function} opts.refreshTransactions
 * @param {boolean}  [opts.debug=false]
 */
export default function useTrueLayerBanking({
  API_URL,
  getAuthHeaders,
  location,
  navigate,
  refreshTransactions,
  debug = false,
}) {
  // ── state ────────────────────────────────────────────────────────────
  const [bankStatus, setBankStatus] = useState(null); // null = unknown/loading
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSyncing, setBankSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState("");

  const [displayBalance, setDisplayBalance] = useState(null);
  const [bankBalance, setBankBalance] = useState(null);

  const [storedBalance, setStoredBalance] = useState(null);
  const [storedBalanceLoading, setStoredBalanceLoading] = useState(true);

  const [liveBalanceLoading, setLiveBalanceLoading] = useState(false);
  const [postConnectRunning, setPostConnectRunning] = useState(false);

  // ── refs / guards ────────────────────────────────────────────────────
  const autoSyncHasRun = useRef(false);
  const handledCallbackRef = useRef(false);
  const balanceReceivedRef = useRef(false);
  const pollTimerRef = useRef(null);

  // ── fetch helpers ────────────────────────────────────────────────────

  const fetchBankBalance = useCallback(async () => {
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
      balanceReceivedRef.current = true;
    } catch (err) {
      console.error("Failed to fetch bank balance:", err);
    } finally {
      setLiveBalanceLoading(false);
    }
  }, [API_URL, getAuthHeaders]);

  const fetchStoredBalance = useCallback(async () => {
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
  }, [API_URL, getAuthHeaders]);

  // ── sync handler ─────────────────────────────────────────────────────

  const handleSyncBank = useCallback(
    async (silent = false, force = false) => {
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
    },
    [API_URL, getAuthHeaders, bankStatus?.connected, bankSyncing, refreshTransactions, fetchBankBalance]
  );

  // ── mount effect: resolve bank connection + handle OAuth callback ───

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
          await fetchStoredBalance();
          return;
        }

        const data = await res.json();
        const connected = !!data.connected;
        setBankStatus({ connected });

        if (connected) {
          await fetchBankBalance();
        } else {
          await fetchStoredBalance();
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name !== "AbortError") console.error("status error:", err);

        setBankStatus({ connected: false });
        await fetchStoredBalance();
      }
    };

    // OAuth callback param handling
    const params = new URLSearchParams(location.search);
    if (debug) console.debug("[WardenInsights] callback params", location.search);

    if (
      (params.has("bankConnected") || params.has("syncing")) &&
      !handledCallbackRef.current
    ) {
      handledCallbackRef.current = true;

      // Clean URL immediately using React Router (no reload)
      navigate(location.pathname, { replace: true });

      autoSyncHasRun.current = true;
      balanceReceivedRef.current = false;
      setBankStatus({ connected: true });
      setBankSyncing(true);
      setPostConnectRunning(true);
      setLastSyncMessage("Bank connected! Syncing your data…");

      // The backend fires quick-sync + full-sync in the background after
      // the OAuth redirect.  We just poll for the results so the UI
      // updates in real-time as data arrives.
      let polls = 0;
      const POLL_MS = 2500;
      const MAX_POLLS = 36; // 36 × 2.5s = 90s

      // Kick off an immediate first fetch
      Promise.allSettled([fetchBankBalance(), refreshTransactions()]);

      pollTimerRef.current = setInterval(async () => {
        polls++;
        try {
          await Promise.allSettled([fetchBankBalance(), refreshTransactions()]);
        } catch (_) { /* swallow */ }

        // Progressive status messages
        if (balanceReceivedRef.current) {
          setLastSyncMessage("Balance loaded ✅  Syncing transactions…");
        }

        if (polls >= MAX_POLLS) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setBankSyncing(false);
          setPostConnectRunning(false);
          setLastSyncMessage("Sync complete ✅");
        }
      }, POLL_MS);

      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
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

  // ── auto-sync when bank is connected (runs once) ────────────────────

  useEffect(() => {
    const bankStatusLoading = bankStatus === null;
    if (bankStatus?.connected && !bankStatusLoading && !autoSyncHasRun.current) {
      autoSyncHasRun.current = true;
      handleSyncBank(true);
    }
  }, [bankStatus?.connected, bankStatus, handleSyncBank]);

  // ── connect handler ──────────────────────────────────────────────────

  const handleConnectBank = useCallback(async () => {
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
  }, [API_URL, getAuthHeaders]);

  // ── derived flags ────────────────────────────────────────────────────

  const bankStatusLoading = bankStatus === null;
  const isBankConnected = bankStatus?.connected === true;
  const isBankDisconnected = bankStatus?.connected === false;

  const hasLiveBankNumber = Number.isFinite(displayBalance?.totalBalance);
  const hasStoredBalance = Number.isFinite(storedBalance?.totalBalance);

  const balanceIsLoading =
    bankStatusLoading ||
    (isBankConnected && (liveBalanceLoading || !hasLiveBankNumber)) ||
    (isBankDisconnected && storedBalanceLoading);

  const baseBalanceValue = hasLiveBankNumber
    ? displayBalance?.totalBalance
    : hasStoredBalance
    ? storedBalance.totalBalance
    : null;

  const noBalanceAvailable =
    isBankDisconnected && !storedBalanceLoading && !hasStoredBalance;

  // ── public API ───────────────────────────────────────────────────────

  return {
    // raw state
    bankStatus,
    bankLoading,
    bankSyncing,
    lastSyncMessage,
    displayBalance,
    bankBalance,
    storedBalance,
    storedBalanceLoading,
    liveBalanceLoading,
    postConnectRunning,

    // derived flags
    bankStatusLoading,
    isBankConnected,
    isBankDisconnected,
    hasLiveBankNumber,
    hasStoredBalance,
    balanceIsLoading,
    baseBalanceValue,
    noBalanceAvailable,

    // actions
    handleConnectBank,
    handleSyncBank,
    fetchBankBalance,
    fetchStoredBalance,
  };
}
