import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "../components/navbar.jsx";
import { useTransactions } from "../state/TransactionsContext";

const API_URL = "http://localhost:4000/api";

// SplitMaker: split a total amount across named categories (or people) using % or £.
export default function SplitMaker() {
  const location = useLocation();
  const navigate = useNavigate();
  const shouldShowHelp = location.state?.showHelp || localStorage.getItem("walletwarden-show-help");
  const incomingPreset = location.state?.preset;
  const skipPresetSelection = location.state?.skipPresetSelection;
  const { addTransaction } = useTransactions?.() ?? {};

  // Presets: mapping from category name -> percent
  const presets = [
    {
      label: "Safe & Simple (Low Stress)",
      desc: "Best for stability and flexibility.",
      mapping: {
        Food: 20,
        Petrol: 10,
        Bills: 25,
        Shopping: 10,
        Entertainment: 10,
        Subscriptions: 5,
        Savings: 10,
        Investing: 10,
      },
      details: [
        "🏠 Needs (rent, bills, food, petrol): 55%",
        "🎮 Wants/hobbies (going out, subscriptions, fun): 25%",
        "💰 Savings + investing: 20%",
      ],
    },
    {
      label: "Balanced & Smart (Best Overall)",
      desc: "Best mix of fun now + money later.",
      mapping: {
        Food: 18,
        Petrol: 8,
        Bills: 14,
        Shopping: 10,
        Entertainment: 10,
        Subscriptions: 10,
        Savings: 10,
        Investing: 20,
      },
      details: ["🏠 Needs: 50%", "🎮 Wants: 20%", "📈 Investing: 20%", "💰 Savings: 10%"],
    },
    {
      label: "Aggressive / Future-Focused",
      desc: "Best if you’re disciplined and want to build wealth.",
      mapping: {
        Food: 15,
        Petrol: 7,
        Bills: 13,
        Shopping: 10,
        Entertainment: 5,
        Subscriptions: 10,
        Savings: 10,
        Investing: 30,

      },
      details: ["🏠 Needs: 45%", "🎮 Wants: 15%", "📈 Investing: 30%", "💰 Savings: 10%"],
    },
  ];

  const [needsPreset, setNeedsPreset] = useState(!incomingPreset && !skipPresetSelection); // gate UI until a preset is chosen
  const [selectedPreset, setSelectedPreset] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Split");

  const [message, setMessage] = useState(null); // { type: "success"|"danger"|"warning", text: string }
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [splitName, setSplitName] = useState("");

  // We'll call them "people" because your UI already uses that variable name,
  // but they behave like categories in this screen.
  const [people, setPeople] = useState([
    { id: crypto.randomUUID(), name: "Food", percent: 0, amount: "" },
    { id: crypto.randomUUID(), name: "Petrol", percent: 0, amount: "" },
    { id: crypto.randomUUID(), name: "Bills", percent: 0, amount: "" },
  ]);

  // No total amount: we only operate on percentages

  // Helper: apply preset mapping to the list
  const applyPreset = (preset) => {
    const newPeople = Object.entries(preset.mapping)
      .filter(([, percent]) => percent > 0) // Only include non-zero categories
      .map(([name, percent]) => ({
        id: crypto.randomUUID(),
        name,
        percent,
        amount: "",
      }));
    setPeople(newPeople);
    setSelectedPreset(preset.label);
    setSplitName(preset.label);
    setMessage({ type: "success", text: `Applied preset: ${preset.label}` });
    setNeedsPreset(false);
  };

  const startWithoutPreset = () => {
    setNeedsPreset(false);
    setSelectedPreset("");
    setMessage(null);
  };

  useEffect(() => {
    // When coming from home page with a preset, apply it immediately
    if (incomingPreset && !selectedPreset) {
      applyPreset(incomingPreset);
    }
    // When coming back to the screen with an already selected preset, skip the gate
    if (selectedPreset) setNeedsPreset(false);
  }, [selectedPreset, incomingPreset]);

  const updatePerson = (id, patch) => {
    setPeople((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  };

  const removePerson = (id) => setPeople((prev) => prev.filter((p) => p.id !== id));

  const addPerson = () => {
    setPeople((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "New category", percent: 0, amount: "" },
    ]);
  };

  const equalize = () => {
    if (people.length === 0) return;
    const each = +(100 / people.length).toFixed(2);
    setPeople((prev) => prev.map((p) => ({ ...p, percent: each })));
    setSelectedPreset("");
  };

  const totals = useMemo(() => {
    const percentSum = people.reduce((sum, p) => sum + (Number(p.percent) || 0), 0);
    return { percentSum: +percentSum.toFixed(2) };
  }, [people]);

  const canAdd = () => {
    if (people.length === 0) return false;
    return Math.abs(totals.percentSum - 100) <= 0.01;
  };

  const handleSaveSplit = () => {
    if (people.length === 0) {
      setMessage({
        type: "danger",
        text: "Please add at least one category before saving.",
      });
      return;
    }

    if (Math.abs(totals.percentSum - 100) > 0.01) {
      setMessage({
        type: "danger",
        text: `Percents must total 100%. You have ${totals.percentSum}%.`,
      });
      return;
    }

    // Prefill name suggestion from existing label/category if available
    setSplitName(description || category || "");
    setShowFrequencyModal(true);
  };

  const confirmSaveSplit = async () => {
    const nameToSave = (splitName || "").trim();
    if (!nameToSave) {
      alert("Please enter a name for this split.");
      return;
    }

    const savedSplit = {
      id: crypto.randomUUID(),
      name: nameToSave,
      frequency: "custom",
      categories: people,
      timestamp: new Date().toISOString(),
    };

    try {
      // Save to backend
      const token = localStorage.getItem("walletwarden-token") || "dev-user";
      const response = await fetch(`${API_URL}/splits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: savedSplit.id,
          name: savedSplit.name,
          frequency: savedSplit.frequency,
          categories: savedSplit.categories,
        }),
      });

      if (response.ok) {
        // Also save to localStorage as backup
        const savedSplits = JSON.parse(localStorage.getItem("walletwardenSplits") || "[]");
        savedSplits.push(savedSplit);
        localStorage.setItem("walletwardenSplits", JSON.stringify(savedSplits));

        setMessage({ type: "success", text: `Split saved as "${savedSplit.name}"! 💾` });
        setShowFrequencyModal(false);
        
        // Navigate to tracker page
        setTimeout(() => {
          navigate("/tracker");
        }, 500);
      } else {
        setMessage({
          type: "danger",
          text: "Failed to save split to server. Please try again.",
        });
      }
    } catch (err) {
      console.error("Error saving split:", err);
      setMessage({
        type: "danger",
        text: "Error saving split. Check your connection and try again.",
      });
    }

    setShowFrequencyModal(false);
  };

  if (needsPreset) {
    return (
      <div className="container py-5" style={{ maxWidth: 960, minHeight: "100vh" }}>
        <Navbar />
        
        {shouldShowHelp && (
          <div className="alert alert-info alert-dismissible fade show mt-4" role="alert">
            <strong>👋 Getting Started:</strong> First pick the split that best aligns with your goals
            <button type="button" className="btn-close" onClick={() => localStorage.removeItem("walletwarden-show-help")} />
          </div>
        )}

        <div className="card shadow-sm mt-4">
          <div className="card-body">
            <h1 className="h4 mb-2">Choose a preset to get started</h1>
            <p className="text-muted mb-4">Pick the baseline split that best fits you. You can tweak percentages after.</p>
            <div className="row g-3">
              {presets.map((preset) => (
                <div className="col-12 col-md-4" key={preset.label}>
                  <div className="card h-100 border-0 shadow-sm">
                    <div className="card-body d-flex flex-column">
                      <h5 className="card-title mb-1">{preset.label}</h5>
                      <p className="text-muted small mb-3">{preset.desc}</p>
                      <ul className="mb-3 small text-muted">
                        {preset.details.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                      <button className="btn btn-primary mt-auto" onClick={() => applyPreset(preset)}>
                        Use this preset
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 d-flex justify-content-end">
              <button className="btn btn-outline-secondary" onClick={startWithoutPreset}>
                Start without preset
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4 mt-5" style={{ maxWidth: 900, minHeight: "100vh", overflowY: "auto" }}>
      <Navbar />

      <div className="card shadow-sm mb-4" style={{ minHeight: 600 }}>
        <div className="card-body" style={{ overflowX: "auto" }}>
          {/* Header */}
          <div className="d-flex align-items-center justify-content-between mb-4">
            <div>
              <h1 className="h4 mb-1">Split Maker</h1>
              <p className="text-muted small mb-0">Allocate your income to categories by percentage or amount</p>
            </div>
          </div>

          {message && (
            <div className={`alert alert-${message.type} alert-dismissible fade show`} role="alert">
              {message.text}
              <button type="button" className="btn-close" onClick={() => setMessage(null)} />
            </div>
          )}

          <div className="row g-4">
            {/* Left Panel - Controls */}
            <div className="col-12 col-lg-3">
              <div className="card border-0 shadow-sm" style={{ position: "sticky", top: "100px" }}>
                <div className="card-body">
                  <h6 className="card-title mb-3 fw-bold"></h6>
                  
                  {/* Total Amount removed; splits operate on percents only */}



                  <hr className="my-3" />

                  {/* Stats Panel (Percent-based) */}
                  <div className="p-3 rounded mb-3" style={{ backgroundColor: "var(--card-border)", border: "1px solid var(--card-border)" }}>
                    <div className="small text-muted mb-2">
                      <strong>Percents total:</strong>
                    </div>
                    <div className="h6 mb-2">
                      {totals.percentSum}% / 100%
                    </div>
                    <div className="progress" style={{ height: "6px" }}>
                      <div
                        className={`progress-bar ${Math.abs(totals.percentSum - 100) < 0.01 ? "bg-success" : "bg-warning"}`}
                        style={{ width: `${Math.min(totals.percentSum, 100)}%` }}
                      />
                    </div>
                    <div className={`small mt-2 fw-semibold ${Math.abs(totals.percentSum - 100) < 0.01 ? "text-success" : "text-warning"}`}>
                      {Math.abs(totals.percentSum - 100) < 0.01 ? "✓ Balanced" : "⚠️ Unbalanced"}
                    </div>
                  </div>

                  <hr className="my-3" />

                  <div className="d-grid gap-2">
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={equalize}
                    >
                      Equal split
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={addPerson}
                    >
                      + Add category
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => setPeople([])}
                    >
                      Clear all
                    </button>
                  </div>

                  <hr className="my-3" />

                  <div className="d-grid gap-2">
                    <button
                      className="btn btn-success"
                      onClick={handleSaveSplit}
                    >
                      Save Split
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel - Categories */}
            <div className="col-12 col-lg-9">
              <div className="card border-0 shadow-sm">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-4">
                    <h6 className="card-title mb-0 fw-bold">Categories</h6>
                    <div className="badge" style={{ backgroundColor: "var(--card-border)", color: "var(--text)" }}>
                      {people.length} {people.length === 1 ? "category" : "categories"}
                    </div>
                  </div>

                  {people.length === 0 ? (
                    <div className="text-center py-5">
                      <div className="text-muted mb-2">No categories added yet</div>
                      <p className="text-muted small">Click "Add category" to get started</p>
                    </div>
                  ) : (
                    <div className="list-group list-group-flush">
                      {people.map((p, idx) => (
                        <div key={p.id} className="list-group-item border-0 px-0 py-2">
                          <div className="row align-items-end g-2">
                            <div className="col-12 col-md-4">
                              <label className="form-label small fw-semibold mb-1">Category Name</label>
                              <input
                                className="form-control form-control-sm"
                                value={p.name}
                                onChange={(e) => updatePerson(p.id, { name: e.target.value })}
                                placeholder="e.g. Food"
                              />
                            </div>
                            <div className="col-6 col-md-2">
                              <label className="form-label small fw-semibold mb-1">Percent</label>
                              <input
                                className="form-control form-control-sm"
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                value={p.percent}
                                onChange={(e) => updatePerson(p.id, { percent: e.target.value })}
                              />
                            </div>

                            <div className="col-12 col-md-2 d-flex gap-2">
                              <button
                                className="btn btn-sm btn-outline-danger flex-grow-1"
                                onClick={() => removePerson(p.id)}
                                title="Remove this category"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Frequency Modal */}
      {showFrequencyModal && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} role="dialog">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Save Split Configuration</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowFrequencyModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Split Name</label>
                  <input
                    className="form-control"
                    value={splitName}
                    onChange={(e) => setSplitName(e.target.value)}
                    placeholder="e.g. January Budget"
                  />
                </div>
                {/* Frequency selection removed; saving uses a safe default behind the scenes */}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowFrequencyModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmSaveSplit}
                >
                  Save Split
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
