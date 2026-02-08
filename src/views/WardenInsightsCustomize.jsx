// src/views/WardenInsightsCustomize.jsx
// Dedicated page for customizing the Warden Insights dashboard layout.
import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/navbar.jsx";
import {
  INSIGHT_WIDGET_CATALOG,
  DEFAULT_INSIGHTS_LAYOUT,
  loadInsightsLayout,
  saveInsightsLayout,
  widgetLabel,
  widgetIcon,
} from "../utils/insightsLayout.js";

export default function WardenInsightsCustomize() {
  const navigate = useNavigate();

  // Work on a local copy – only persist on explicit Save
  const [layout, setLayout] = useState(() => loadInsightsLayout());

  // ── Derived: which widget types can still be added ────────────────
  const availableToAdd = useMemo(() => {
    const present = new Set(layout.map(w => w.type));
    return INSIGHT_WIDGET_CATALOG.filter(w => !present.has(w.type));
  }, [layout]);

  // ── Layout operations ─────────────────────────────────────────────
  const moveWidget = useCallback((id, dir) => {
    setLayout(prev => {
      const idx = prev.findIndex(w => w.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const removeWidget = useCallback((id) => {
    setLayout(prev => prev.filter(w => w.id !== id));
  }, []);

  const addWidget = useCallback((type) => {
    setLayout(prev => [
      ...prev,
      { id: `${type}-${Date.now()}`, type },
    ]);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────
  const handleSave = () => {
    saveInsightsLayout(layout);
    navigate("/wardeninsights");
  };

  const handleCancel = () => {
    navigate("/wardeninsights");
  };

  const handleReset = () => {
    setLayout([...DEFAULT_INSIGHTS_LAYOUT]);
  };

  return (
    <div
      className="container-fluid py-4 mt-5"
      style={{ maxWidth: 900, minHeight: "100vh", overflowY: "auto" }}
    >
      <Navbar />

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="h5 mb-1">Customize Insights</h2>
              <p className="text-muted small mb-0">
                Add, remove, and reorder your dashboard widgets.
              </p>
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={handleCancel}>
                ← Back
              </button>
              <button className="btn btn-sm btn-outline-warning" onClick={handleReset}>
                Reset
              </button>
              <button className="btn btn-sm btn-primary" onClick={handleSave}>
                Save Layout
              </button>
            </div>
          </div>

          {/* ── Two-column layout ───────────────────────────────────── */}
          <div className="row g-4">
            {/* Left: Available widgets */}
            <div className="col-12 col-md-5">
              <div className="card">
                <div className="card-body">
                  <h6 className="card-title mb-3">Available Widgets</h6>

                  {availableToAdd.length === 0 ? (
                    <p className="text-muted small mb-0">
                      All widgets are in your layout already.
                    </p>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {availableToAdd.map(w => (
                        <button
                          key={w.type}
                          className="btn btn-outline-primary btn-sm d-flex align-items-center justify-content-between"
                          onClick={() => addWidget(w.type)}
                        >
                          <span>
                            <span className="me-2">{w.icon}</span>
                            {w.label}
                          </span>
                          <span className="badge bg-primary">+ Add</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Current layout */}
            <div className="col-12 col-md-7">
              <div className="card">
                <div className="card-body">
                  <h6 className="card-title mb-3">
                    Your Layout
                    <span className="badge bg-secondary ms-2">{layout.length}</span>
                  </h6>

                  {layout.length === 0 ? (
                    <p className="text-muted small mb-0">
                      No widgets in your layout. Add some from the left panel.
                    </p>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {layout.map((widget, idx) => (
                        <div
                          key={widget.id}
                          className="card"
                          style={{
                            borderLeft: "3px solid var(--bs-primary, #0d6efd)",
                          }}
                        >
                          <div className="card-body py-2 px-3 d-flex align-items-center justify-content-between gap-2">
                            {/* Preview label */}
                            <div className="d-flex align-items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: "1.1rem" }}>{widgetIcon(widget.type)}</span>
                              <div>
                                <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                                  {widgetLabel(widget.type)}
                                </div>
                                <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                  Position {idx + 1}
                                </div>
                              </div>
                            </div>

                            {/* Controls */}
                            <div className="d-flex gap-1 flex-shrink-0">
                              <button
                                className="btn btn-sm btn-outline-secondary py-0 px-1"
                                style={{ fontSize: "0.8rem", lineHeight: 1.2 }}
                                disabled={idx === 0}
                                onClick={() => moveWidget(widget.id, -1)}
                                title="Move up"
                              >
                                ↑
                              </button>
                              <button
                                className="btn btn-sm btn-outline-secondary py-0 px-1"
                                style={{ fontSize: "0.8rem", lineHeight: 1.2 }}
                                disabled={idx === layout.length - 1}
                                onClick={() => moveWidget(widget.id, 1)}
                                title="Move down"
                              >
                                ↓
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger py-0 px-1"
                                style={{ fontSize: "0.8rem", lineHeight: 1.2 }}
                                onClick={() => removeWidget(widget.id)}
                                title="Remove"
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

          {/* ── Save / Cancel footer ────────────────────────────────── */}
          <div className="d-flex justify-content-end gap-2 mt-4">
            <button className="btn btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              Save Layout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
