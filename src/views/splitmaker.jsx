import React, { useEffect, useMemo, useState } from "react";
import Navbar from "../components/navbar.jsx";
import { useTransactions } from "../state/TransactionsContext";

const API_URL = "http://localhost:4000/api";

// SplitMaker: split a total amount across named categories (or people) using % or £.
export default function SplitMaker() {
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

  // ✅ Missing state (this is why you got "mode is not defined")
  const [mode, setMode] = useState("percent"); // "percent" | "amount"
  const [needsPreset, setNeedsPreset] = useState(true); // gate UI until a preset is chosen
  const [selectedPreset, setSelectedPreset] = useState("");

  const [amount, setAmount] = useState(""); // total amount
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Split");

  const [message, setMessage] = useState(null); // { type: "success"|"danger"|"warning", text: string }
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [selectedFrequency, setSelectedFrequency] = useState("monthly");

  // We'll call them "people" because your UI already uses that variable name,
  // but they behave like categories in this screen.
  const [people, setPeople] = useState([
    { id: crypto.randomUUID(), name: "Food", percent: 0, amount: "" },
    { id: crypto.randomUUID(), name: "Petrol", percent: 0, amount: "" },
    { id: crypto.randomUUID(), name: "Bills", percent: 0, amount: "" },
  ]);

  const parsedAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

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
    setMode("percent");
    setSelectedPreset(preset.label);
    setMessage({ type: "success", text: `Applied preset: ${preset.label}` });
    setNeedsPreset(false);
  };

  const startWithoutPreset = () => {
    setNeedsPreset(false);
    setSelectedPreset("");
    setMessage(null);
  };

  useEffect(() => {
    // When coming back to the screen with an already selected preset, skip the gate
    if (selectedPreset) setNeedsPreset(false);
  }, [selectedPreset]);

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
    setMode("percent");
    const each = +(100 / people.length).toFixed(2);
    setPeople((prev) => prev.map((p) => ({ ...p, percent: each })));
    setSelectedPreset("");
  };

  const peopleWithAmounts = useMemo(() => {
    // Compute amounts from percents OR percents from amounts
    if (mode === "percent") {
      return people.map((p) => {
        const pct = Number(p.percent) || 0;
        const computedAmount = (parsedAmount * pct) / 100;
        return { ...p, computedAmount };
      });
    }

    // mode === "amount"
    return people.map((p) => {
      const a = Number(p.amount) || 0;
      const computedPercent = parsedAmount > 0 ? +((a / parsedAmount) * 100).toFixed(2) : 0;
      return { ...p, computedAmount: a, computedPercent };
    });
  }, [people, mode, parsedAmount]);

  const totals = useMemo(() => {
    const percentSum =
      mode === "percent"
        ? people.reduce((sum, p) => sum + (Number(p.percent) || 0), 0)
        : peopleWithAmounts.reduce((sum, p) => sum + (Number(p.computedPercent) || 0), 0);

    const amountSum =
      mode === "percent"
        ? peopleWithAmounts.reduce((sum, p) => sum + (Number(p.computedAmount) || 0), 0)
        : people.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return {
      percentSum: +percentSum.toFixed(2),
      amountSum: +amountSum.toFixed(2),
    };
  }, [people, peopleWithAmounts, mode]);

  const previewTotal = useMemo(() => {
    // what the split currently adds up to (in £)
    if (mode === "percent") return totals.amountSum;
    return totals.amountSum;
  }, [mode, totals.amountSum]);

  const canAdd = () => {
    if (parsedAmount <= 0) return false;
    if (people.length === 0) return false;

    if (mode === "percent") {
      return Math.abs(totals.percentSum - 100) <= 0.01;
    }
    // amount mode: must sum to total
    return Math.abs(totals.amountSum - parsedAmount) <= 0.01;
  };

  const handleAddSplits = () => {
    if (!canAdd()) {
      setMessage({
        type: "danger",
        text:
          mode === "percent"
            ? `Percents must total 100%. You have ${totals.percentSum}%.`
            : `Amounts must total £${parsedAmount.toFixed(2)}. You have £${totals.amountSum.toFixed(2)}.`,
      });
      return;
    }

    if (typeof addTransaction !== "function") {
      setMessage({
        type: "warning",
        text: "addTransaction() wasn’t found on TransactionsContext. Check your context exports.",
      });
      return;
    }

    // Create one transaction per category line (expense by default)
    peopleWithAmounts.forEach((p) => {
      const amt = Number(p.computedAmount) || 0;
      if (amt <= 0) return;

      addTransaction({
        type: "expense",
        amount: amt,
        date: new Date().toISOString(),
        category: p.name,
        description: description || `Split: ${category}`,
      });
    });

    setMessage({ type: "success", text: "Splits added to transactions ✅" });
    setAmount("");
    setDescription("");
  };

  const handleSaveSplit = () => {
    if (people.length === 0) {
      setMessage({
        type: "danger",
        text: "Please add at least one category before saving.",
      });
      return;
    }

    if (mode === "percent" && Math.abs(totals.percentSum - 100) > 0.01) {
      setMessage({
        type: "danger",
        text: `Percents must total 100%. You have ${totals.percentSum}%.`,
      });
      return;
    }

    setShowFrequencyModal(true);
  };

  const confirmSaveSplit = async () => {
    const savedSplit = {
      id: crypto.randomUUID(),
      name: description || category || "Unnamed Split",
      frequency: selectedFrequency,
      categories: people,
      timestamp: new Date().toISOString(),
    };

    try {
      // Save to backend
      const token = localStorage.getItem("auth0Token") || "dev-user";
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

        setMessage({
          type: "success",
          text: `Split saved as "${savedSplit.name}" (${selectedFrequency})! 💾`,
        });
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
          {/* Presets Dropdown */}
          <div className="mb-3">
            <label className="form-label fw-semibold">Presets</label>
            <select
              className="form-select form-select-sm w-auto d-inline-block ms-2"
              value={selectedPreset || ""}
              onChange={(e) => {
                const preset = presets.find((p) => p.label === e.target.value);
                if (preset) applyPreset(preset);
              }}
            >
              <option value="">Choose a preset…</option>
              {presets.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>

            {selectedPreset && (
              <div className="small text-muted mt-1">
                {presets.find((p) => p.label === selectedPreset)?.desc}
                <ul className="mb-0 mt-1" style={{ fontSize: 12 }}>
                  {presets
                    .find((p) => p.label === selectedPreset)
                    ?.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                </ul>
              </div>
            )}
          </div>

          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h1 className="h5 mb-1">Split Maker</h1>
              <p className="text-muted small mb-0">Split an amount between categories with editable shares.</p>
            </div>
            <div className="d-flex gap-2">
              <button
                className={`btn btn-sm ${mode === "percent" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setMode("percent")}
              >
                By %
              </button>
              <button
                className={`btn btn-sm ${mode === "amount" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setMode("amount")}
              >
                By amount
              </button>
            </div>
          </div>

          {message && (
            <div className={`alert alert-${message.type} mt-3`} role="alert">
              {message.text}
            </div>
          )}

          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label small">Total Amount</label>
              <input
                className="form-control form-control-lg"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="form-text">Enter income (e.g. 125.00)</div>

              <div className="mt-3">
                <label className="form-label small">Description</label>
                <input
                  className="form-control"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Dinner / Rent / Utilities"
                />
              </div>

              <div className="mt-3">
                <label className="form-label small">Category (fallback)</label>
                <input className="form-control" value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>

              <div className="d-flex gap-2 mt-3 flex-wrap">
                <button className="btn btn-outline-secondary" onClick={equalize}>
                  Equal split
                </button>
                <button className="btn btn-outline-danger" onClick={() => setPeople([])}>
                  Clear
                </button>
                <button className="btn btn-outline-success" onClick={addPerson}>
                  Add category
                </button>
              </div>

              <div className="mt-3 small text-muted">
                Percent sum: {totals.percentSum}% · Amount sum: £{totals.amountSum.toFixed(2)}
              </div>
              <div className={`mt-2 ${Math.abs(previewTotal - parsedAmount) > 0.01 ? "text-danger" : "text-success"}`}>
                Preview total: £{previewTotal.toFixed(2)}{" "}
                {Math.abs(previewTotal - parsedAmount) > 0.01 ? "(mismatch)" : "(ok)"}
              </div>

              <div className="mt-3">
                <button className="btn btn-primary w-100" disabled={!canAdd()} onClick={handleAddSplits}>
                  Add splits
                </button>
              </div>

              <div className="mt-2">
                <button className="btn btn-success w-100" onClick={handleSaveSplit}>
                  Save Split
                </button>
              </div>
            </div>

            <div className="col-12 col-md-8">
              <div className="card p-3" style={{ minHeight: 360 }}>
                <h6 className="mb-3">Categories & Shares</h6>

                {people.length === 0 ? (
                  <div className="text-muted">No categories added — add categories to start splitting.</div>
                ) : (
                  <div className="list-group">
                    {peopleWithAmounts.map((p) => (
                      <div key={p.id} className="list-group-item px-2 py-3">
                        <div className="row align-items-center g-2">
                          <div className="col-12 col-md-4 mb-2 mb-md-0">
                            <input
                              className="form-control form-control-sm"
                              style={{ width: "100%" }}
                              value={p.name}
                              onChange={(e) => updatePerson(p.id, { name: e.target.value })}
                            />
                          </div>

                          {mode === "percent" ? (
                            <>
                              <div className="col-6 col-md-3">
                                <label className="form-label small mb-0">%</label>
                                <input
                                  className="form-control form-control-sm"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  value={p.percent}
                                  onChange={(e) => updatePerson(p.id, { percent: e.target.value })}
                                />
                              </div>
                              <div className="col-6 col-md-3">
                                <label className="form-label small mb-0">Spend Limit</label>
                                <input
                                  className="form-control form-control-sm"
                                  value={(p.computedAmount ?? 0).toFixed(2)}
                                  disabled
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="col-6 col-md-3">
                                <label className="form-label small mb-0">Amount</label>
                                <input
                                  className="form-control form-control-sm"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={p.amount}
                                  onChange={(e) => updatePerson(p.id, { amount: e.target.value })}
                                />
                              </div>
                              <div className="col-6 col-md-3">
                                <label className="form-label small mb-0">%</label>
                                <input className="form-control form-control-sm" value={`${p.computedPercent ?? 0}%`} disabled />
                              </div>
                            </>
                          )}

                          <div className="col-12 col-md-2 d-flex justify-content-md-end mt-2 mt-md-0">
                            <button className="btn btn-sm btn-outline-danger w-100" onClick={() => removePerson(p.id)}>
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="small text-muted mt-2">Preview: £{(p.computedAmount ?? 0).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
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
                <p className="mb-3">Is this a weekly, monthly, or yearly income split?</p>
                <div className="d-flex gap-2 flex-wrap">
                  {["weekly", "monthly", "yearly"].map((freq) => (
                    <button
                      key={freq}
                      className={`btn flex-grow-1 ${
                        selectedFrequency === freq ? "btn-primary" : "btn-outline-secondary"
                      }`}
                      onClick={() => setSelectedFrequency(freq)}
                    >
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </button>
                  ))}
                </div>
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
