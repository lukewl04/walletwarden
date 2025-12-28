import React, { useMemo, useState } from "react";
import CsvPdfUpload from "../components/csv-pdf-upload.jsx";
import Navbar from "../components/navbar.jsx";

export default function WardenInsights({
  transactions = [],
  totals: globalTotals,
  addTransaction,
  bulkAddTransactions,
}) {
  const categories = [
    "Food",
    "Petrol",
    "Subscriptions",
    "Transport",
    "Bills",
    "Shopping",
    "Savings",
    "Entertainment",
    "Other",
  ];

  // Quick add state
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [description, setDescription] = useState("");

  // Insights controls
  const [monthsBack, setMonthsBack] = useState(6);
  const [showCumulative, setShowCumulative] = useState(true);

  const formattedBalance = useMemo(() => {
    const b = globalTotals?.balance ?? 0;
    const sign = b < 0 ? "-" : "";
    return `${sign}£${Math.abs(b).toFixed(2)}`;
  }, [globalTotals]);

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

    const stripped = String(input)
      .replace(/(\d+)(st|nd|rd|th)/gi, "$1")
      .trim();
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
      return { ...t, date, amount: amt, type, description: desc };
    });
  }, [transactions]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    parsed.forEach((t) => {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    });
    return { income, expense };
  }, [parsed]);

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

    parsed.forEach((t) => {
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
  }, [parsed, monthsBack, showCumulative]);

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
      {
        key: "Entertainment",
        re: /\b(cinema|theatre|concert|event|museum|game)\b/i,
      },
      { key: "Savings", re: /\b(savings|save|deposit|isa|pot)\b/i },
      { key: "Other", re: /./i },
    ];

    const map = {};
    parsed.forEach((t) => {
      if (t.type !== "expense") return;

      let key = null;

      // Prefer explicit category (if matches bucket key)
      if (t.category) {
        const found = buckets.find(
          (b) => b.key.toLowerCase() === String(t.category).toLowerCase()
        );
        if (found) key = found.key;
      }

      // Otherwise infer from description
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
  }, [parsed]);

  // ---- charts ----
  const Donut = ({ income, expense, size = 160, thickness = 22 }) => {
    const total = income + expense || 1;
    const radius = (size - thickness) / 2;
    const circ = 2 * Math.PI * radius;

    const incomeArc = (income / total) * circ;
    const expenseArc = (expense / total) * circ;

    return (
      <div style={{ width: size, textAlign: "center" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`translate(${size / 2},${size / 2})`}>
            <circle r={radius} fill="none" stroke="#eee" strokeWidth={thickness} />

            <circle
              r={radius}
              fill="none"
              stroke="#1c7d3a"
              strokeWidth={thickness}
              strokeDasharray={`${incomeArc} ${circ - incomeArc}`}
              strokeDashoffset={-expenseArc / 2}
              transform="rotate(-90)"
            />

            <circle
              r={radius}
              fill="none"
              stroke="#c53030"
              strokeWidth={thickness}
              strokeDasharray={`${expenseArc} ${circ - expenseArc}`}
              strokeDashoffset={incomeArc / 2}
              transform="rotate(-90)"
            />

            <text x="0" y="4" textAnchor="middle" fontSize="14" fontWeight={600}>
              £{Math.abs(income - expense).toFixed(2)}
            </text>
            <text x="0" y="22" textAnchor="middle" fontSize="11" fill="#666">
              Net
            </text>
          </g>
        </svg>
        <div className="small text-muted">
          Income £{income.toFixed(2)} · Expense £{expense.toFixed(2)}
        </div>
      </div>
    );
  };

  const LineChart = ({ data, width = 600, height = 160 }) => {
    const values = data.map((d) => Number(showCumulative ? d.cum : d.net) || 0);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const pad = { l: 28, r: 12, t: 8, b: 24 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;

    const pts = values.map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w + pad.l;
      const y = ((max - v) / range) * h + pad.t;
      return [x, y];
    });

    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join(" ");

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = pad.t + f * h;
          return <line key={f} x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="#eee" />;
        })}

        {data.map((it, i) => {
          const x = (i / Math.max(1, data.length - 1)) * w + pad.l;
          return (
            <text key={i} x={x} y={height - 6} fontSize={11} textAnchor="middle" fill="#666">
              {it.label}
            </text>
          );
        })}

        <path
          d={`${d} L ${width - pad.r},${height - pad.b} L ${pad.l},${height - pad.b} Z`}
          fill="rgba(28,125,58,0.08)"
        />
        <path d={d} fill="none" stroke="#1c7d3a" strokeWidth={2} />

        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="#fff" stroke="#1c7d3a" strokeWidth={1.2} />
        ))}
      </svg>
    );
  };

  const Bars = ({ items = [], width = 700, height = 220 }) => {
    if (!items.length) return null;

    const pad = { l: 12, r: 12, t: 20, b: 36 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;

    const gap = 12;
    const bw = Math.max(32, (w - (items.length - 1) * gap) / items.length);
    const max = Math.max(...items.map((i) => i.amount), 1);

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {items.map((it, idx) => {
          const x = pad.l + idx * (bw + gap);
          const barH = (it.amount / max) * h;
          const y = pad.t + (h - barH);

          return (
            <g key={idx}>
              <rect x={x} y={y} width={bw} height={barH} fill="#c53030" rx={6} />
              <text x={x + bw / 2} y={height - 12} fontSize={11} fill="#333" textAnchor="middle">
                {it.category.length > 12 ? it.category.slice(0, 12) + "…" : it.category}
              </text>
              <text x={x + bw / 2} y={y - 8} fontSize={11} fill="#333" textAnchor="middle">
                £{it.amount.toFixed(0)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
  <div
    className="container-fluid py-4 mt-5"
    style={{ maxWidth: 900, minHeight: "100vh", overflowY: "auto" }}
  >
    <Navbar />

    {/* Put everything else inside a card like SplitMaker */}
    <div className="card shadow-sm mb-4">
      <div className="card-body">
        {/* Header + controls */}
        <div className="d-flex align-items-start justify-content-between mb-3">
          <div>
            <h2 className="h5 mb-1">Warden Dashboard</h2>
            <p className="text-muted small mb-0">
              Everything from the old homepage lives here now.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="btn-group" role="group">
              <button
                className={`btn btn-sm ${monthsBack === 3 ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setMonthsBack(3)}
              >
                3m
              </button>
              <button
                className={`btn btn-sm ${monthsBack === 6 ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setMonthsBack(6)}
              >
                6m
              </button>
              <button
                className={`btn btn-sm ${monthsBack === 12 ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setMonthsBack(12)}
              >
                12m
              </button>
            </div>

            <div className="form-check form-switch ms-2">
              <input
                className="form-check-input"
                type="checkbox"
                id="cumSwitch"
                checked={showCumulative}
                onChange={(e) => setShowCumulative(e.target.checked)}
              />
              <label className="form-check-label small" htmlFor="cumSwitch">
                Cumulative
              </label>
            </div>
          </div>
        </div>

        {/* Balance */}
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between gap-3">
              <div>
                <div className="text-muted small">Current Balance</div>
                <div className={`display-6 mb-0 ${(globalTotals?.balance ?? 0) < 0 ? "text-danger" : "text-success"}`}>
                  {formattedBalance}
                </div>
              </div>
              <span className={`badge rounded-pill ${(globalTotals?.balance ?? 0) < 0 ? "text-bg-danger" : "text-bg-success"}`}>
                {(globalTotals?.balance ?? 0) < 0 ? "Over budget" : "Looking good"}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Add + Upload */}
        <div className="row g-3 mb-3">
          <div className="col-12 col-md-4">
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <h2 className="h6 mb-3">Quick Add</h2>

                <div className="mb-2">
                  <label className="form-label">Amount</label>
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

                <div className="mb-2">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-2">
                  <label className="form-label">Description (optional)</label>
                  <input
                    className="form-control"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Tesco / Rent / Salary"
                  />
                </div>

                <div className="d-flex gap-2 mt-3">
                  <button className="btn btn-success w-100" onClick={() => handleAddTransaction("income")}>
                    + Income
                  </button>
                  <button className="btn btn-danger w-100" onClick={() => handleAddTransaction("expense")}>
                    − Expense
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-8">
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <h2 className="h6 mb-2">Upload CSV/PDF</h2>
                <CsvPdfUpload bulkAddTransactions={bulkAddTransactions} />
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        {parsed.length === 0 ? (
          <div className="text-muted">No transactions to show. Import some transactions to see insights.</div>
        ) : (
          <div className="row g-3 mb-3">
            <div className="col-12 col-md-4 d-flex align-items-center justify-content-center">
              <Donut income={totals.income} expense={totals.expense} />
            </div>

            <div className="col-12 col-md-8">
              <div className="card p-2" style={{ height: 220 }}>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <small className="text-muted">{showCumulative ? "Cumulative balance" : "Net per month"}</small>
                  <small className="text-muted">{monthsBack} months</small>
                </div>
                <div style={{ width: "100%", height: 160 }}>
                  <LineChart data={monthly} width={600} height={160} />
                </div>
              </div>
            </div>

            <div className="col-12">
              <div className="card p-2">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div>
                    <strong>Top Expense Categories</strong>
                    <div className="text-muted small">Largest buckets</div>
                  </div>
                  <div className="text-muted small">{topExpenses.length} shown</div>
                </div>

                {topExpenses.length === 0 ? (
                  <div className="text-muted">No expense data available.</div>
                ) : (
                  <div style={{ minHeight: 260 }}>
                    <Bars items={topExpenses} width={700} height={220} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        <div className="card shadow-sm">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h2 className="h6 mb-0">Recent Transactions</h2>
              <span className="text-muted small">{transactions.length} total</span>
            </div>

            {transactions.length === 0 ? (
              <div className="text-muted">No transactions yet</div>
            ) : (
              <ul className="list-group">
                {transactions.map((t) => (
                  <li key={t.id} className="list-group-item d-flex align-items-start justify-content-between">
                    <div style={{ flex: 1 }}>
                      <div className="d-flex align-items-center gap-2">
                        <span className={t.type === "income" ? "text-success fw-semibold" : "text-danger fw-semibold"}>
                          {t.type === "income" ? "+ " : "− "}£{Number(t.amount).toFixed(2)}
                        </span>
                        <span className="badge bg-secondary" style={{ fontSize: "0.75rem" }}>
                          {t.category || "Other"}
                        </span>
                      </div>

                      {t.description && (
                        <div className="text-muted small mt-1" style={{ fontSize: "0.85rem" }}>
                          {t.description}
                        </div>
                      )}
                    </div>

                    <span className="text-muted small ms-3" style={{ whiteSpace: "nowrap" }}>
                      {new Date(t.date).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  </div>
);

}
