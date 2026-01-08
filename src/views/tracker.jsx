import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/navbar.jsx";
import CsvPdfUpload from "../components/csv-pdf-upload.jsx";
import { useTransactions } from "../state/TransactionsContext";

const API_URL = "http://localhost:4000/api";

export default function Tracker() {
  const { addTransaction, bulkAddTransactions, transactions: globalTransactions = [] } = useTransactions?.() ?? {};
  const [savedSplits, setSavedSplits] = useState([]);
  const [selectedSplit, setSelectedSplit] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [purchases, setPurchases] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [newPurchase, setNewPurchase] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    category: "",
    description: "",
  });
  const [showOverBudgetAlert, setShowOverBudgetAlert] = useState(false);
  const [overBudgetCategories, setOverBudgetCategories] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [unlinkedTransactionsCount, setUnlinkedTransactionsCount] = useState(0);
  const [categoryRules, setCategoryRules] = useState({}); // description -> category
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [isImportingFromInsights, setIsImportingFromInsights] = useState(false);

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
    }
  }, []);

  // Persist category rules
  useEffect(() => {
    try {
      localStorage.setItem("walletwardenCategoryRules", JSON.stringify(categoryRules));
    } catch (e) {
      console.warn("Failed to save category rules", e);
    }
  }, [categoryRules]);

  // Load splits and purchases from backend on initial mount
  useEffect(() => {
    const loadDataFromBackend = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem("auth0Token") || "dev-user";

        // Load splits
        const splitsResponse = await fetch(`${API_URL}/splits`, {
          headers: { "Authorization": `Bearer ${token}` },
        });

        let loadedSplits = [];
        if (splitsResponse.ok) {
          loadedSplits = await splitsResponse.json();
          setSavedSplits(loadedSplits);
          
          // Also update localStorage
          localStorage.setItem("walletwardenSplits", JSON.stringify(loadedSplits));
          
          // Set first split as selected if available
          if (loadedSplits.length > 0 && !selectedSplit) {
            setSelectedSplit(loadedSplits[0].id);
          }
        } else {
          // Fallback to localStorage if backend fails
          const localSplits = localStorage.getItem("walletwardenSplits");
          if (localSplits) {
            loadedSplits = JSON.parse(localSplits);
            setSavedSplits(loadedSplits);
            if (loadedSplits.length > 0) {
              setSelectedSplit(loadedSplits[0].id);
            }
          }
        }

        // Load purchases
        const purchasesResponse = await fetch(`${API_URL}/purchases`, {
          headers: { "Authorization": `Bearer ${token}` },
        });

        if (purchasesResponse.ok) {
          const allPurchases = await purchasesResponse.json();
          setPurchases(allPurchases);
        }
      } catch (err) {
        console.error("Error loading data from backend:", err);
        
        // Fallback to localStorage on error
        const localSplits = localStorage.getItem("walletwardenSplits");
        if (localSplits) {
          const splits = JSON.parse(localSplits);
          setSavedSplits(splits);
          if (splits.length > 0) {
            setSelectedSplit(splits[0].id);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadDataFromBackend();
  }, []);

  // Filter purchases by selected split
  const filteredPurchases = useMemo(() => {
    if (!selectedSplit) return [];
    return purchases.filter((p) => p.split_id === selectedSplit);
  }, [purchases, selectedSplit]);

  // Count unlinked transactions from Warden Insights
  useEffect(() => {
    if (!selectedSplit || !globalTransactions) {
      setUnlinkedTransactionsCount(0);
      return;
    }

    console.log('[Tracker] Global transactions:', globalTransactions.length);
    console.log('[Tracker] Purchases:', purchases.length);

    // Get all purchase IDs that are already linked to any split
    const linkedTransactionIds = new Set(
      purchases.map(p => p.transaction_id).filter(Boolean)
    );

    console.log('[Tracker] Linked transaction IDs:', Array.from(linkedTransactionIds));

    // Count expense transactions that aren't linked to any purchase
    const unlinked = globalTransactions.filter(t => 
      t.type === "expense" && !linkedTransactionIds.has(t.id)
    );

    console.log('[Tracker] Unlinked transactions:', unlinked.length, unlinked);
    setUnlinkedTransactionsCount(unlinked.length);
  }, [globalTransactions, purchases, selectedSplit]);

  // Check for over-budget categories
  useEffect(() => {
    if (!selectedSplitData || !filteredPurchases.length) {
      setShowOverBudgetAlert(false);
      setOverBudgetCategories([]);
      return;
    }

    const overBudget = [];
    const periodPurchases = getPeriodPurchases();
    
    selectedSplitData.categories.forEach((cat) => {
      const categoryPurchases = periodPurchases.filter((p) => p.category === cat.name);
      const categoryTotal = categoryPurchases.reduce((sum, p) => sum + p.amount, 0);
      const totalSpent = periodPurchases.reduce((sum, p) => sum + p.amount, 0);
      const allocatedAmount = (totalSpent * cat.percent) / 100;
      const percentUsed = totalSpent > 0 ? (categoryTotal / allocatedAmount) * 100 : 0;

      if (percentUsed > 100) {
        overBudget.push({
          name: cat.name,
          spent: categoryTotal,
          budget: allocatedAmount,
          percent: percentUsed,
        });
      }
    });

    setOverBudgetCategories(overBudget);
    setShowOverBudgetAlert(overBudget.length > 0);
  }, [filteredPurchases, selectedSplitData]);

  // Sync splits to backend (only after initial load)
  useEffect(() => {
    if (isLoading) return; // Don't sync during initial load
    
    const syncSplitsToBackend = async () => {
      if (savedSplits.length === 0) return;
      
      try {
        const token = localStorage.getItem("auth0Token") || "dev-user";
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

  // Sync purchases to backend (only after initial load)
  useEffect(() => {
    if (isLoading) return; // Don't sync during initial load
    
    const syncPurchasesToBackend = async () => {
      if (purchases.length === 0 || !selectedSplit) return;

      try {
        const token = localStorage.getItem("auth0Token") || "dev-user";
        const purchasesToSync = purchases.filter((p) => p.split_id === selectedSplit);
        
        for (const purchase of purchasesToSync) {
          await fetch(`${API_URL}/purchases`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: purchase.id,
              split_id: selectedSplit,
              date: purchase.date,
              amount: purchase.amount,
              category: purchase.category,
              description: purchase.description,
            }),
          });
        }
      } catch (err) {
        console.error("Error syncing purchases:", err);
      }
    };

    syncPurchasesToBackend();
  }, [purchases, selectedSplit, isLoading]);

  // Load purchases from backend on mount
  useEffect(() => {
    const loadPurchasesFromBackend = async () => {
      try {
        const token = localStorage.getItem("auth0Token") || "dev-user";
        const response = await fetch(`${API_URL}/purchases`, {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          if (selectedSplit) {
            const filtered = data.filter((p) => p.split_id === selectedSplit);
            setPurchases(filtered);
          }
        }
      } catch (err) {
        console.error("Error loading purchases from backend:", err);
      }
    };

    loadPurchasesFromBackend();
  }, [selectedSplit]);

  // Calculate category budgets based on split
  const categoryBudgets = useMemo(() => {
    if (!selectedSplitData) return {};
    const budgets = {};
    selectedSplitData.categories.forEach((cat) => {
      budgets[cat.name] = {
        percent: cat.percent,
        name: cat.name,
      };
    });
    return budgets;
  }, [selectedSplitData]);

  // Get days in current month
  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);

  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  }, [firstDay, daysInMonth]);

  const handleAddPurchase = () => {
    if (!newPurchase.amount || !newPurchase.category) {
      alert("Please fill in amount and category");
      return;
    }

    const purchase = {
      id: crypto.randomUUID(),
      split_id: selectedSplit,
      ...newPurchase,
      amount: parseFloat(newPurchase.amount),
    };

    setPurchases([...purchases, purchase]);

    // Add transaction
    if (typeof addTransaction === "function") {
      addTransaction({
        type: "expense",
        amount: purchase.amount,
        date: purchase.date,
        category: purchase.category,
        description: purchase.description,
      });
    }

    setNewPurchase({
      date: new Date().toISOString().split("T")[0],
      amount: "",
      category: "",
      description: "",
    });
    setShowAddModal(false);
  };

  const handleDeletePurchase = async (purchaseId) => {
    if (!confirm("Are you sure you want to delete this purchase?")) return;

    try {
      const token = localStorage.getItem("auth0Token") || "dev-user";
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
    // Call the original bulkAddTransactions if it exists
    if (typeof bulkAddTransactions === "function") {
      bulkAddTransactions(transactions);
    }
    
    // Function to match imported category to split category
    const matchCategory = (importedCat, description = "") => {
      const ruleHit = categoryRules[normalizeDescriptionKey(description)];
      if (ruleHit) return ruleHit;

      // Generic keywords that work with any category name
      const keywordsByType = {
        food: ["tesco", "sainsbury", "asda", "morrisons", "lidl", "aldi", "waitrose", "co-op", "coop", "grocery", "supermarket", "bakery", "deli", "market", "restaurant", "cafe", "pizza", "burger", "mcdonald", "kfc", "subway", "starbucks", "costa", "pub", "bar", "meals", "food", "greggs", "pret", "leon"],
        petrol: ["bp", "shell", "esso", "tesco fuel", "sainsbury fuel", "motorbike", "taxi", "uber", "lyft", "train", "rail", "bus", "transport", "parking", "petrol", "diesel", "fuel", "car", "auto", "chevron"],
        entertainment: ["cinema", "netflix", "spotify", "game", "steam", "playstation", "xbox", "nintendo", "theatre", "concert", "ticket", "movie", "film", "music", "entertainment"],
        utilities: ["water", "gas", "electric", "council tax", "broadband", "internet", "phone", "mobile", "virgin", "bt", "plusnet", "bills"],
        health: ["pharmacy", "doctor", "dentist", "hospital", "medical", "gym", "fitness", "health", "optician", "boots", "nhs", "wellbeing"],
        shopping: ["amazon", "ebay", "argos", "john lewis", "marks spencer", "h&m", "zara", "clothes", "fashion", "homeware", "furniture", "ikea", "b&q", "wickes", "screwfix", "shop", "john lewis"],
        subscriptions: ["subscription", "spotify", "netflix", "adobe", "microsoft", "apple"],
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
        // First try exact key match (e.g., "Shopping" -> keywordsByType.shopping)
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

    // Convert date format from DD/MM/YYYY to YYYY-MM-DD
    const formatDate = (dateStr) => {
      if (!dateStr) return new Date().toISOString().split("T")[0];
      
      // If already in YYYY-MM-DD format, return as-is
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      
      // Convert DD/MM/YYYY to YYYY-MM-DD
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split("/");
        return `${year}-${month}-${day}`;
      }
      
      // Try to parse as date and format
      const d = new Date(dateStr);
      if (!isNaN(d)) {
        return d.toISOString().split("T")[0];
      }
      
      return new Date().toISOString().split("T")[0];
    };

    // Convert transactions to purchases with split_id
    const newPurchases = transactions
      .filter(t => t.type === "expense")
      .map(t => {
        const matched = matchCategory(t.category, t.description);
        return {
          id: crypto.randomUUID(),
          split_id: selectedSplit,
          date: formatDate(t.date),
          amount: t.amount,
          category: matched,
          description: t.description || "",
        };
      });

    if (newPurchases.length > 0) {
      setPurchases(prev => [...prev, ...newPurchases]);
      
      // Automatically navigate to the period of the most recent uploaded transaction
      const mostRecentDate = newPurchases.reduce((latest, p) => {
        const pDate = new Date(p.date);
        return pDate > latest ? pDate : latest;
      }, new Date(newPurchases[0].date));
      
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

    // Get all purchase IDs that are already linked
    const linkedTransactionIds = new Set(
      purchases.map(p => p.transaction_id).filter(Boolean)
    );

    // Filter unlinked expense transactions
    const unlinkedTransactions = globalTransactions.filter(t => 
      t.type === "expense" && !linkedTransactionIds.has(t.id)
    );

    if (unlinkedTransactions.length === 0) {
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

    // Use the same matching logic as handleBulkAdd
    const matchCategory = (importedCat, description = "") => {
      const ruleHit = categoryRules[normalizeDescriptionKey(description)];
      if (ruleHit) return ruleHit;

      const keywordsByType = {
        food: ["tesco", "sainsbury", "asda", "morrisons", "lidl", "aldi", "waitrose", "co-op", "coop", "grocery", "supermarket", "bakery", "deli", "market", "restaurant", "cafe", "pizza", "burger", "mcdonald", "kfc", "subway", "starbucks", "costa", "pub", "bar", "meals", "food", "greggs", "pret", "leon"],
        petrol: ["bp", "shell", "esso", "tesco fuel", "sainsbury fuel", "motorbike", "taxi", "uber", "lyft", "train", "rail", "bus", "transport", "parking", "petrol", "diesel", "fuel", "car", "auto", "chevron"],
        entertainment: ["cinema", "netflix", "spotify", "game", "steam", "playstation", "xbox", "nintendo", "theatre", "concert", "ticket", "movie", "film", "music", "entertainment"],
        utilities: ["water", "gas", "electric", "council tax", "broadband", "internet", "phone", "mobile", "virgin", "bt", "plusnet", "bills"],
        health: ["pharmacy", "doctor", "dentist", "hospital", "medical", "gym", "fitness", "health", "optician", "boots", "nhs", "wellbeing"],
        shopping: ["amazon", "ebay", "argos", "john lewis", "marks spencer", "h&m", "zara", "clothes", "fashion", "homeware", "furniture", "ikea", "b&q", "wickes", "screwfix", "shop"],
        subscriptions: ["subscription", "spotify", "netflix", "adobe", "microsoft", "apple"],
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

    const formatDate = (dateStr) => {
      if (!dateStr) return new Date().toISOString().split("T")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split("/");
        return `${year}-${month}-${day}`;
      }
      const d = new Date(dateStr);
      if (!isNaN(d)) return d.toISOString().split("T")[0];
      return new Date().toISOString().split("T")[0];
    };

    // Convert unlinked transactions to purchases
    const newPurchases = uniqueUnlinked.map(t => {
      const matched = matchCategory(t.category, t.description);
      return {
        id: crypto.randomUUID(),
        split_id: selectedSplit,
        transaction_id: t.id, // Link to the global transaction
        date: formatDate(t.date),
        amount: t.amount,
        category: matched,
        description: t.description || "",
      };
    });

    if (newPurchases.length > 0) {
      setPurchases(prev => [...prev, ...newPurchases]);
      
      const mostRecentDate = newPurchases.reduce((latest, p) => {
        const pDate = new Date(p.date);
        return pDate > latest ? pDate : latest;
      }, new Date(newPurchases[0].date));
      
      setCurrentDate(mostRecentDate);
      
      setSyncMessage(`Imported ${newPurchases.length} transactions from Warden Insights ✓`);
      setTimeout(() => setSyncMessage(""), 3000);
    }

    setIsImportingFromInsights(false);
  };

  const getDayPurchases = (day) => {
    if (!day) return [];
    const dateStr = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    )
      .toISOString()
      .split("T")[0];
    return filteredPurchases.filter((p) => p.date === dateStr);
  };

  const getDayTotal = (day) => {
    const dayPurchases = getDayPurchases(day);
    return dayPurchases.reduce((sum, p) => sum + p.amount, 0);
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

  const previousMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
  };

  const monthYear = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Get the relevant period based on frequency
  const getPeriodLabel = () => {
    if (!selectedSplitData) return "";
    const freq = selectedSplitData.frequency;
    
    if (freq === "weekly") {
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return `Week of ${weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} - ${weekEnd.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;
    } else if (freq === "monthly") {
      return monthYear;
    } else if (freq === "yearly") {
      return currentDate.getFullYear().toString();
    }
  };

  const getPeriodPurchases = () => {
    if (!selectedSplitData) return [];
    const freq = selectedSplitData.frequency;

    if (freq === "weekly") {
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      return filteredPurchases.filter((p) => {
        const pDate = new Date(p.date);
        return pDate >= weekStart && pDate <= weekEnd;
      });
    } else if (freq === "monthly") {
      return filteredPurchases.filter((p) => {
        const pDate = new Date(p.date);
        return (
          pDate.getMonth() === currentDate.getMonth() &&
          pDate.getFullYear() === currentDate.getFullYear()
        );
      });
    } else if (freq === "yearly") {
      return filteredPurchases.filter((p) => {
        const pDate = new Date(p.date);
        return pDate.getFullYear() === currentDate.getFullYear();
      });
    }

    return [];
  };

  return (
    <div className="container-fluid py-4 mt-5" style={{ maxWidth: 1200, minHeight: "100vh" }}>
      <Navbar />

      <div className="mb-4">
        <h1 className="h4 mb-3">Spending Tracker</h1>

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
          <div className="mb-3">
            <label className="form-label small fw-semibold">Select Split</label>
            <select
              className="form-select form-select-sm w-auto"
              value={selectedSplit || ""}
              onChange={(e) => setSelectedSplit(e.target.value)}
            >
              <option value="">Choose a split…</option>
              {savedSplits.map((split) => (
                <option key={split.id} value={split.id}>
                  {split.name} ({split.frequency})
                </option>
              ))}
            </select>
          </div>
        )}

        {unlinkedTransactionsCount > 0 && selectedSplit && (
          <div className="alert alert-warning mb-3" role="alert">
            <div className="d-flex align-items-center justify-content-between gap-3">
              <div>
                <strong>📥 {unlinkedTransactionsCount} transaction{unlinkedTransactionsCount !== 1 ? 's' : ''}</strong> from Warden Insights {unlinkedTransactionsCount !== 1 ? 'are' : 'is'} not linked to this split yet.
                <br />
                <small className="text-muted">Click "Import Now" to automatically categorize and add them to this split.</small>
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

        {selectedSplitData && (
          <div className="card mb-4 p-3">
            <h6 className="mb-2">
              {selectedSplitData.name} - {selectedSplitData.frequency}
            </h6>
            <div className="d-flex gap-2 flex-wrap">
              {selectedSplitData.categories.map((cat) => (
                <small key={cat.id} className="badge bg-light text-dark">
                  {cat.name}: {cat.percent}%
                </small>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedSplit && (
        <>
          <div className="row g-3">
            {/* Sidebar Toolbox */}
            <div className="col-12 col-lg-3">
              <div className="card shadow-sm" style={{ position: "sticky", top: "80px" }}>
                <div className="card-body">
                  <h6 className="mb-3">Add or Import</h6>

                  <Link
                    to="/wardeninsights"
                    className="btn btn-primary w-100 mb-2"
                    title="Add transactions or income in Warden Insights"
                  >
                    Add
                  </Link>

                  <div className="text-muted small mb-3">
                    Manage all new expenses and income from Warden Insights; they’ll sync back here.
                  </div>

                  <button
                    className="btn btn-sm btn-outline-secondary w-100 mb-2"
                    onClick={() => setShowAddModal(true)}
                  >
                    💬 Input Transactions
                  </button>

                  <button
                    className="btn btn-sm btn-outline-primary w-100"
                    onClick={() => setShowImportModal(true)}
                  >
                    📄 Import Statements
                  </button>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="col-12 col-lg-9">
              {/* Spreadsheet View */}
              <div className="card mb-4">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h5 className="mb-0">Purchases - {getPeriodLabel()}</h5>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={previousMonth}
                      >
                        ← Previous
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={nextMonth}
                      >
                        Next →
                      </button>
                    </div>
                  </div>

              {/* Spreadsheet Table */}
              <div className="table-responsive" style={{ maxHeight: "500px", overflowY: "auto" }}>
                <table className="table table-sm table-hover table-bordered mb-0">
                  <thead style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "var(--card-bg)", borderColor: "var(--card-border)" }}>
                    <tr>
                      <th style={{ width: "120px" }}>Date</th>
                      <th style={{ width: "150px" }}>Category</th>
                      <th style={{ width: "120px" }} className="text-end">Amount</th>
                      <th>Description</th>
                      <th style={{ width: "80px" }} className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPeriodPurchases().length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center text-muted py-4">
                          No purchases for this period. Click "+ Add Purchase" to get started.
                        </td>
                      </tr>
                    ) : (
                      getPeriodPurchases()
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .map((purchase) => {
                          const categoryData = selectedSplitData?.categories.find(
                            (c) => c.name === purchase.category
                          );
                          return (
                            <tr key={purchase.id}>
                              <td>
                                {new Date(purchase.date).toLocaleDateString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </td>
                              <td>
                                {editingPurchaseId === purchase.id ? (
                                  <select
                                    className="form-select form-select-sm"
                                    value={purchase.category}
                                    onChange={(e) => handleUpdatePurchaseCategory(purchase.id, e.target.value)}
                                    onBlur={() => setEditingPurchaseId(null)}
                                    autoFocus
                                  >
                                    {selectedSplitData?.categories.map((cat) => (
                                      <option key={cat.id} value={cat.name}>
                                        {cat.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <button
                                    className="badge bg-secondary"
                                    style={{ border: "none", cursor: "pointer" }}
                                    onClick={() => setEditingPurchaseId(purchase.id)}
                                    title="Click to edit category"
                                  >
                                    {purchase.category}
                                  </button>
                                )}
                                {categoryData && (
                                  <span className="text-muted small ms-1">
                                    ({categoryData.percent}%)
                                  </span>
                                )}
                              </td>
                              <td className="text-end fw-bold">£{purchase.amount.toFixed(2)}</td>
                              <td className="text-muted">{purchase.description || "—"}</td>
                              <td className="text-center">
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleDeletePurchase(purchase.id)}
                                  title="Delete"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                  <tfoot className="fw-bold" style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--card-border)" }}>
                    <tr>
                      <td colSpan="2" className="text-end">Total:</td>
                      <td className="text-end">
                        £{getPeriodPurchases().reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                      </td>
                      <td colSpan="2"></td>
                    </tr>
                  </tfoot>
                </table>
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

              {/* Summary */}
              {filteredPurchases.length > 0 && (
                <div className="card">
                  <div className="card-body">
                    <h6 className="mb-3">
                      {selectedSplitData.frequency === "weekly" ? "Weekly" : selectedSplitData.frequency === "monthly" ? "Monthly" : "Yearly"} Summary - {getPeriodLabel()}
                    </h6>
                <div className="row">
                  {selectedSplitData?.categories.map((cat) => {
                    const categoryPurchases = getPeriodPurchases().filter((p) => p.category === cat.name);
                    const categoryTotal = categoryPurchases.reduce((sum, p) => sum + p.amount, 0);
                    const totalSpent = getPeriodPurchases().reduce((sum, p) => sum + p.amount, 0);
                    const allocatedAmount = (totalSpent * cat.percent) / 100;
                    const percentUsed = totalSpent > 0 ? (categoryTotal / allocatedAmount) * 100 : 0;
                    const clamped = Math.min(percentUsed, 150);
                    const radius = 48;
                    const halfCirc = Math.PI * radius; // semicircle length
                    const progress = (clamped / 100) * halfCirc;
                    
                    return (
                      <div key={cat.id} className="col-md-4 mb-3">
                        <div className="card p-2">
                          <div className="small text-muted">{cat.name}</div>
                          <div className="fw-bold">£{categoryTotal.toFixed(2)}</div>
                          <div className="small text-muted">
                            {cat.percent}% allocated (£{allocatedAmount.toFixed(2)} budget)
                          </div>
                          <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: "6px" }}>
                            <svg width="140" height="90" viewBox="0 0 140 90">
                              <g transform="translate(70,70)">
                                <path
                                  d={`M ${-radius} 0 A ${radius} ${radius} 0 0 1 ${radius} 0`}
                                  fill="none"
                                  stroke="#e9ecef"
                                  strokeWidth="12"
                                  strokeLinecap="round"
                                />
                                <path
                                  d={`M ${-radius} 0 A ${radius} ${radius} 0 0 1 ${radius} 0`}
                                  fill="none"
                                  stroke={percentUsed > 100 ? "#dc3545" : "#28a745"}
                                  strokeWidth="12"
                                  strokeLinecap="round"
                                  strokeDasharray={`${progress} ${halfCirc}`}
                                  strokeDashoffset={halfCirc - progress}
                                />
                                <circle r="4" fill={percentUsed > 100 ? "#dc3545" : "#28a745"} transform={`rotate(${Math.min(clamped,150) * 1.8 - 90}) translate(${radius},0)`} />
                                <text x="0" y="-10" textAnchor="middle" fontSize="14" fontWeight="700">
                                  {percentUsed.toFixed(0)}%
                                </text>
                                <text x="0" y="8" textAnchor="middle" fontSize="11" fill="#6c757d">
                                  {percentUsed > 100 ? "Over" : "Used"}
                                </text>
                              </g>
                            </svg>
                          </div>
                          <div className="small text-muted text-center" style={{ marginTop: "-6px" }}>
                            {percentUsed > 100 ? "⚠️ Over budget" : "On track"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
              )}

              {/* Over Budget Alert Modal */}
              {showOverBudgetAlert && (
                <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.7)" }} role="dialog">
                  <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content border-danger">
                      <div className="modal-header bg-danger text-white">
                        <h5 className="modal-title">⚠️ Budget Alert</h5>
                        <button
                          type="button"
                          className="btn-close btn-close-white"
                          onClick={() => setShowOverBudgetAlert(false)}
                        />
                      </div>
                      <div className="modal-body text-center">
                        <img
                          src="/warden.png"
                          alt="Warden"
                          style={{ maxWidth: "200px", marginBottom: "20px" }}
                        />
                        <h6 className="text-danger fw-bold mb-3">You've exceeded your budget!</h6>
                        <div className="alert alert-danger">
                          {overBudgetCategories.map((cat, idx) => (
                            <div key={idx} className="mb-2">
                              <strong>{cat.name}:</strong> £{cat.spent.toFixed(2)} spent of £{cat.budget.toFixed(2)} ({cat.percent.toFixed(0)}%)
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => setShowOverBudgetAlert(false)}
                        >
                          Acknowledge
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                        <p className="text-muted mb-3">
                          Upload your bank statement in CSV or PDF format. Transactions will be automatically categorized based on your split's categories.
                        </p>
                        <CsvPdfUpload bulkAddTransactions={handleBulkAdd} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
