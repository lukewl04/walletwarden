// src/components/charts/Donut.jsx
import React from "react";

export default function Donut({ income, expense, size = 160, thickness = 22 }) {
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
          <text
            fill="#f8f8f8"
            x="0"
            y="4"
            textAnchor="middle"
            fontSize="14"
            fontWeight={600}
          >
            £{Math.abs(income - expense).toFixed(2)}
          </text>
          <text x="0" y="22" textAnchor="middle" fontSize="11" fill="#666">
            Net
          </text>
        </g>
      </svg>
      <div className="small text-muted">
        Income £{Number(income || 0).toFixed(2)} · Expense £{Number(expense || 0).toFixed(2)}
      </div>
    </div>
  );
}
