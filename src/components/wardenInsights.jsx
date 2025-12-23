import React, { useMemo, useState } from "react";

// A compact component that renders lightweight SVG charts (no external deps)
// Props:
// - transactions: [{ id, type: 'income'|'expense', amount: number, date: string (parseable), description? }]
// Usage: <WardenInsights transactions={transactions} />

export default function WardenInsights({ transactions = [] }) {
  const [monthsBack, setMonthsBack] = useState(6); // 3, 6, 12
  const [showCumulative, setShowCumulative] = useState(true);

  // Safely parse a date-like input into a Date object, with fallbacks
  const safeParseDate = (input) => {
    if (input instanceof Date && !isNaN(input)) return input;
    if (!input) return new Date();

    // Try a direct parse first
    let d = new Date(input);
    if (!isNaN(d)) return d;

    // Strip ordinal suffixes like '1st', '2nd', '3rd', '4th' and append current year
    const stripped = String(input).replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
    d = new Date(`${stripped} ${new Date().getFullYear()}`);
    if (!isNaN(d)) return d;

    // Final fallback to today
    return new Date();
  };

  const parsed = useMemo(() => {
    // normalize transactions and ensure numeric amounts and Date objects
    return (transactions || []).map((t) => {
      const date = safeParseDate(t.date);
      const amount = Number(t.amount) || 0;
      const type = (t.type || "expense").toLowerCase() === "income" ? "income" : "expense";
      const description = (t.description || "").trim();
      return { ...t, date, amount, type, description };
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

  // Monthly aggregation for the past N months
  const monthly = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7); // YYYY-MM
      months.push({ key, date: d, label: d.toLocaleString(undefined, { month: "short", year: "2-digit" }) });
    }

    const map = {};
    months.forEach((m) => (map[m.key] = { income: 0, expense: 0 }));

    parsed.forEach((t) => {
      const key = t.date.toISOString().slice(0, 7);
      if (map[key]) {
        if (t.type === "income") map[key].income += t.amount;
        else map[key].expense += t.amount;
      }
    });

    const list = months.map((m) => ({ ...m, ...map[m.key], net: map[m.key].income - map[m.key].expense }));

    if (showCumulative) {
      let cum = 0;
      return list.map((l) => {
        cum += l.net;
        return { ...l, cum };
      });
    }

    return list;
  }, [parsed, monthsBack, showCumulative]);

  // Top expense categories (bucketing descriptions into broader categories)
  const topExpenses = useMemo(() => {
    const buckets = [
      { key: 'Food', re: /\b(grocer|supermarket|restaurant|cafe|takeaway|food|kfc|mcdonald|pret|sainsbury|tesco|aldi|lidl|co-op|waitrose)\b/i },
      { key: 'Petrol', re: /\b(petrol|fuel|esso|shell|bp|texaco|station)\b/i },
      { key: 'Subscriptions', re: /\b(subscription|netflix|spotify|prime|apple|google play|membership|monthly|subscription)\b/i },
      { key: 'Transport', re: /\b(uber|taxi|train|bus|tube|tram|transport|ticket|metro)\b/i },
      { key: 'Bills', re: /\b(bill|electric|gas|water|utility|vodafone|o2|ee|broadband|rent|mortgage|insurance)\b/i },
      { key: 'Shopping', re: /\b(amazon|shop|store|clothing|asos|hm|zara|argos|boots|currys|argos)\b/i },
      { key: 'Entertainment', re: /\b(cinema|theatre|concert|event|museum|gallery|zoo|park)\b/i },
      { key: 'Savings', re: /\b(savings|save|deposit|saving|pot|isa)\b/i },
      { key: 'Other', re: /./i },
    ];

    const map = {};
    parsed.forEach((t) => {
      if (t.type !== 'expense') return;
      const desc = (t.description || 'Other').toLowerCase();

      // If an explicit category is provided and matches a bucket key, use it
      let key = null;
      if (t.category) {
        const found = buckets.find((b) => b.key.toLowerCase() === String(t.category).toLowerCase());
        if (found) key = found.key;
      }

      // If not provided, find all matching buckets and choose the most specific one
      if (!key) {
        let best = null;
        buckets.forEach((b, idx) => {
          // reset lastIndex in case regex has global flag
          if (b.re && b.re.exec) { try { b.re.lastIndex = 0; } catch (_) {} }
          const m = b.re.exec(desc);
          if (m) {
            const matchLen = (m[0] || '').length;
            if (!best || matchLen > best.matchLen || (matchLen === best.matchLen && idx < best.idx)) {
              best = { key: b.key, matchLen, idx };
            }
          }
        });
        key = (best && best.key) || 'Other';
      }

      map[key] = (map[key] || 0) + t.amount;
    });

    const arr = Object.entries(map).map(([category, amount]) => ({ category, amount }));
    arr.sort((a, b) => b.amount - a.amount);

    try {
      console.debug('WardenInsights: parsed', parsed.length, 'expenses', parsed.filter(p => p.type === 'expense').length);
      console.debug('WardenInsights: top map', map, 'arr', arr.slice(0, 10));
    } catch (e) {}

    return arr.slice(0, 6);
  }, [parsed]);

  // Helper chart components
  const Donut = ({ income, expense, size = 160, thickness = 22 }) => {
    const total = income + expense || 1;
    const incomePct = (income / total) * 100;
    const expensePct = (expense / total) * 100;

    const radius = (size - thickness) / 2;
    const circ = 2 * Math.PI * radius;

    const incomeArc = (income / total) * circ;
    const expenseArc = (expense / total) * circ;

    return (
      <div style={{ width: size, textAlign: "center" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`translate(${size / 2},${size / 2})`}>
            {/* background ring */}
            <circle r={radius} fill="none" stroke="#eee" strokeWidth={thickness} />

            {/* income arc (green) */}
            <circle
              r={radius}
              fill="none"
              stroke="#1c7d3a"
              strokeWidth={thickness}
              strokeDasharray={`${incomeArc} ${circ - incomeArc}`}
              strokeDashoffset={-expenseArc / 2}
              transform="rotate(-90)"
              style={{ transition: "stroke-dasharray 0.5s" }}
            />

            {/* expense arc (red) */}
            <circle
              r={radius}
              fill="none"
              stroke="#c53030"
              strokeWidth={thickness}
              strokeDasharray={`${expenseArc} ${circ - expenseArc}`}
              strokeDashoffset={incomeArc / 2}
              transform="rotate(-90)"
              style={{ transition: "stroke-dasharray 0.5s" }}
            />

            <text x="0" y="4" textAnchor="middle" fontSize="14" fontWeight={600}>
              £{Math.abs(income - expense).toFixed(2)}
            </text>
            <text x="0" y="22" textAnchor="middle" fontSize="11" fill="#666">
              Net
            </text>
          </g>
        </svg>

        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 12, height: 12, background: "#1c7d3a", display: "inline-block", borderRadius: 3 }} />
            <small>Income £{income.toFixed(2)}</small>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 12, height: 12, background: "#c53030", display: "inline-block", borderRadius: 3 }} />
            <small>Expense £{expense.toFixed(2)}</small>
          </div>
        </div>
      </div>
    );
  };

  const LineChart = ({ data, width = 520, height = 160 }) => {
    // data: [{ label, value, cum? }]
    const values = data.map((d) => Number(showCumulative ? d.cum : d.net) || 0);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const padding = { left: 28, right: 12, top: 8, bottom: 24 };
    const w = width - padding.left - padding.right;
    const h = height - padding.top - padding.bottom;

    // clamp helper to keep coordinates inside the chart area
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

    const points = values.map((v, i) => {
      let x = (i / Math.max(1, values.length - 1)) * w + padding.left;
      let y = ((max - v) / range) * h + padding.top;
      x = clamp(x, padding.left, width - padding.right);
      y = clamp(y, padding.top, height - padding.bottom);
      return [x, y];
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        <defs>
          <clipPath id="wardenLineClip">
            <rect x={padding.left} y={padding.top} width={w} height={h} rx={4} />
          </clipPath>
        </defs>

        {/* grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padding.top + f * h;
          return <line key={f} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#eee" />;
        })}

        {/* axis labels */}
        {data.map((d, i) => {
          const x = (i / Math.max(1, data.length - 1)) * w + padding.left;
          return (
            <text key={i} x={x} y={height - 6} fontSize={11} textAnchor="middle" fill="#666">
              {d.label}
            </text>
          );
        })}

        <g clipPath="url(#wardenLineClip)">
          {/* area */}
          <path d={`${pathD} L ${width - padding.right},${height - padding.bottom} L ${padding.left},${height - padding.bottom} Z`} fill="rgba(28,125,58,0.08)" stroke="none" />

          {/* line */}
          <path d={pathD} fill="none" stroke="#1c7d3a" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* points */}
          {points.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="#fff" stroke="#1c7d3a" strokeWidth={1.2} />
          ))}
        </g>
      </svg>
    );
  };

  const Bars = ({ items = [], width = 520, height = 220 }) => {
    if (!items || items.length === 0) return null;

    const padding = { left: 12, right: 12, top: 20, bottom: 36 };
    const w = width - padding.left - padding.right;
    const h = height - padding.top - padding.bottom;
    const gap = 12;
    const bw = Math.max(32, (w - (items.length - 1) * gap) / items.length);
    const max = Math.max(...items.map((i) => i.amount), 1);

    const colors = {
      Food: '#e0534a',
      Petrol: '#f6a623',
      Subscriptions: '#7b61ff',
      Transport: '#17a2b8',
      Bills: '#6c757d',
      Shopping: '#ff7ab6',
      Other: '#c53030',
    };

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        {items.map((it, idx) => {
          const x = padding.left + idx * (bw + gap);
          const barH = (it.amount / max) * h;
          const y = padding.top + (h - barH);
          const label = it.category || it.description || 'Other';
          const color = colors[it.category] || '#c53030';
          return (
            <g key={idx}>
              <rect x={x} y={y} width={bw} height={barH} fill={color} rx={6} />
              <text x={x + bw / 2} y={height - 12} fontSize={11} fill="#333" textAnchor="middle">
                {label.length > 12 ? label.slice(0, 12) + '…' : label}
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
    <div className="card shadow-sm p-3">
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <h2 className="h5 mb-1">Warden Insights</h2>
          <p className="text-muted small mb-0">Visualise your income, spending trends and biggest expenses</p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="btn-group" role="group">
            <button className={`btn btn-sm ${monthsBack === 3 ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setMonthsBack(3)}>3m</button>
            <button className={`btn btn-sm ${monthsBack === 6 ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setMonthsBack(6)}>6m</button>
            <button className={`btn btn-sm ${monthsBack === 12 ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setMonthsBack(12)}>12m</button>
          </div>
          <div className="form-check form-switch ms-2">
            <input className="form-check-input" type="checkbox" id="cumSwitch" checked={showCumulative} onChange={(e) => setShowCumulative(e.target.checked)} />
            <label className="form-check-label small" htmlFor="cumSwitch">Cumulative</label>
          </div>
        </div>
      </div>

      {parsed.length === 0 ? (
        <div className="text-muted">No transactions to show. Import some transactions to see insights.</div>
      ) : (
        <div className="row g-3">
          <div className="col-12 col-md-4 d-flex align-items-center justify-content-center">
            <Donut income={totals.income} expense={totals.expense} />
          </div>

          <div className="col-12 col-md-8">
            <div className="card p-2" style={{ height: 220 }}>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <small className="text-muted">{showCumulative ? 'Cumulative balance' : 'Net per month'}</small>
                <small className="text-muted">{monthsBack} months</small>
              </div>
              <div style={{ width: '100%', height: 160 }}>
                <LineChart data={monthly} width={600} height={160} />
              </div>
            </div>
          </div>

          <div className="col-12">
            <div className="card p-2">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div>
                      <strong>Top Expense Categories</strong>
                  <div className="text-muted small">Largest expense buckets by category</div>
                  <div className="text-muted smaller" style={{ fontSize: 11, marginTop: 4 }}>Debug: expenses={parsed.filter(p => p.type === 'expense').length}</div>
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
    </div>
  );
}
