// src/components/charts/LineChart.jsx
import React, { useMemo } from "react";

export default function LineChart({
  data,
  showCumulative = true,
  width = 600,
  height = 160,
}) {
  const values = useMemo(
    () => (data || []).map((d) => Number(showCumulative ? d.cum : d.net) || 0),
    [data, showCumulative]
  );

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
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = pad.t + f * h;
        return (
          <line
            key={f}
            x1={pad.l}
            x2={width - pad.r}
            y1={y}
            y2={y}
            stroke="#eee"
          />
        );
      })}

      {(data || []).map((it, i) => {
        const x = (i / Math.max(1, (data || []).length - 1)) * w + pad.l;
        return (
          <text
            key={i}
            x={x}
            y={height - 6}
            fontSize={11}
            textAnchor="middle"
            fill="#666"
          >
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
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={2.5}
          fill="#fff"
          stroke="#1c7d3a"
          strokeWidth={1.2}
        />
      ))}
    </svg>
  );
}
