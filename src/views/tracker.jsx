import React, { useState, useMemo, useEffect } from "react";
import Navbar from "../components/navbar.jsx";
import { useTransactions } from "../state/TransactionsContext";

const API_URL = "http://localhost:4000/api";

export default function Tracker() {
  const { addTransaction } = useTransactions?.() ?? {};
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

  const selectedSplitData = useMemo(
    () => savedSplits.find((s) => s.id === selectedSplit),
    [selectedSplit, savedSplits]
  );

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
          {/* Calendar Header */}
          <div className="card mb-4">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={previousMonth}
                >
                  ← Prev
                </button>
                <h5 className="mb-0">{monthYear}</h5>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={nextMonth}
                >
                  Next →
                </button>
              </div>

              {/* Calendar Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: "4px",
                }}
              >
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div
                    key={day}
                    className="fw-semibold text-center p-2"
                    style={{ backgroundColor: "#f0f0f0" }}
                  >
                    {day}
                  </div>
                ))}

                {calendarDays.map((day, idx) => {
                  const dayPurchases = getDayPurchases(day);
                  const dayTotal = getDayTotal(day);
                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: day ? "#fff" : "#f9f9f9",
                        border: "1px solid #ddd",
                        minHeight: "120px",
                        padding: "8px",
                        cursor: day ? "pointer" : "default",
                      }}
                      onClick={() => {
                        if (day) {
                          setNewPurchase({
                            ...newPurchase,
                            date: new Date(
                              currentDate.getFullYear(),
                              currentDate.getMonth(),
                              day
                            )
                              .toISOString()
                              .split("T")[0],
                          });
                          setShowAddModal(true);
                        }
                      }}
                    >
                      {day && (
                        <>
                          <div className="fw-bold mb-2">{day}</div>
                          <div style={{ fontSize: "12px", maxHeight: "80px", overflowY: "auto" }}>
                            {dayPurchases.map((p) => (
                              <div
                                key={p.id}
                                className="text-truncate mb-1 p-1 d-flex justify-content-between align-items-start"
                                style={{
                                  backgroundColor: "#e9ecef",
                                  borderRadius: "3px",
                                  fontSize: "11px",
                                  gap: "4px",
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="text-truncate">{p.category}</div>
                                  <div className="fw-semibold">£{p.amount.toFixed(2)}</div>
                                </div>
                                <button
                                  className="btn btn-sm btn-close"
                                  style={{ padding: "0", minWidth: "16px" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePurchase(p.id);
                                  }}
                                  title="Delete purchase"
                                />
                              </div>
                            ))}
                          </div>
                          {dayTotal > 0 && (
                            <div
                              className="mt-1 pt-1 border-top"
                              style={{ fontSize: "12px", fontWeight: "bold" }}
                            >
                              Total: £{dayTotal.toFixed(2)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
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
                    const barWidth = Math.min(percentUsed, 150); // Cap at 150% to show overspending
                    
                    return (
                      <div key={cat.id} className="col-md-4 mb-3">
                        <div className="card p-2">
                          <div className="small text-muted">{cat.name}</div>
                          <div className="fw-bold">£{categoryTotal.toFixed(2)}</div>
                          <div className="small text-muted">
                            {cat.percent}% allocated (£{allocatedAmount.toFixed(2)} budget)
                          </div>
                          <div
                            style={{
                              width: "100%",
                              height: "4px",
                              backgroundColor: "#e9ecef",
                              marginTop: "4px",
                              borderRadius: "2px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${barWidth}%`,
                                backgroundColor: percentUsed > 100 ? "#dc3545" : "#28a745",
                                borderRadius: "2px",
                              }}
                            />
                          </div>
                          <div className="small text-muted mt-1">
                            {percentUsed > 100 ? "⚠️" : "✓"} {percentUsed.toFixed(0)}% of budget used
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
