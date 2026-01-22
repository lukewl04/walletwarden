// src/components/charts/Bars.jsx
import React from "react";

export default function Bars({ items = [], width = 700, height = 220 }) {
  if (!items.length) return null;

  const pad = { l: 12, r: 12, t: 20, b: 60 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const gap = 12;
  const bw = Math.max(32, (w - (items.length - 1) * gap) / items.length);
  const max = Math.max(...items.map((i) => Number(i.amount) || 0), 1);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
    >
      {items.map((it, idx) => {
        const x = pad.l + idx * (bw + gap);
        const amt = Number(it.amount) || 0;
        const barH = (amt / max) * h;
        const y = pad.t + (h - barH);

        const label = String(it.category || it.vendor || "Item");
        const shortLabel = label.length > 16 ? label.slice(0, 16) + "…" : label;

        return (
          <g key={idx}>
            <rect x={x} y={y} width={bw} height={barH} fill="#0d6efd" rx={6} />
            <text
              x={x + bw / 2}
              y={pad.t + h + 10}
              fontSize={10}
              fill="#333"
              textAnchor="end"
              transform={`rotate(-45 ${x + bw / 2} ${pad.t + h + 10})`}
              dominantBaseline="middle"
            >
              {shortLabel}
            </text>
            <text
              x={x + bw / 2}
              y={y - 8}
              fontSize={11}
              fill="#333"
              textAnchor="middle"
            >
              £{amt.toFixed(0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
