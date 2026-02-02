import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

function PurchasesPivotTable({
  viewMode,
  setViewMode,
  prefersReducedMotion,
  weekDays,
  dayNames,
  monthWeeks,
  monthNames,
  yearStart,
  splitCategoryNames,
  getPurchasesInRange,
  buildCategoryTotals,
  getCellItems,
  toDateOnlyString,
  formatMoney,
  money,
  getViewTotal,
}) {
  // ===== Hover tooltip state (isolated to prevent parent re-renders) =====
  const [hoverTip, setHoverTip] = useState(null);
  const tooltipCloseTimeoutRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  // Open hover tooltip with position calculation
  const openHoverTip = useCallback((evt, title, items, pinned = false) => {
    // Clear any pending close timeout
    if (tooltipCloseTimeoutRef.current) {
      clearTimeout(tooltipCloseTimeoutRef.current);
      tooltipCloseTimeoutRef.current = null;
    }

    const padding = 12;
    const tooltipWidth = 320;
    const tooltipMaxHeight = 500;
    
    // Calculate position ensuring tooltip stays within viewport
    let x = evt.clientX + padding;
    let y = evt.clientY + padding;
    
    // Adjust horizontal position if too close to right edge
    if (x + tooltipWidth > window.innerWidth) {
      x = evt.clientX - tooltipWidth - padding;
    }
    
    // Adjust vertical position if too close to bottom edge
    if (y + tooltipMaxHeight > window.innerHeight) {
      y = Math.max(padding, window.innerHeight - tooltipMaxHeight - padding);
    }
    
    // Ensure minimum distance from edges
    x = Math.max(padding, Math.min(x, window.innerWidth - tooltipWidth - padding));
    y = Math.max(padding, y);
    
    setHoverTip({ x, y, title, items, pinned });
  }, []);

  const closeHoverTip = useCallback(() => {
    if (tooltipCloseTimeoutRef.current) {
      clearTimeout(tooltipCloseTimeoutRef.current);
      tooltipCloseTimeoutRef.current = null;
    }
    setHoverTip(null);
  }, []);

  const scheduleCloseHoverTip = useCallback((delay = 100) => {
    if (tooltipCloseTimeoutRef.current) {
      clearTimeout(tooltipCloseTimeoutRef.current);
    }
    tooltipCloseTimeoutRef.current = setTimeout(() => {
      setHoverTip((prev) => {
        if (!prev || prev.pinned) return prev;
        return null;
      });
    }, delay);
  }, []);

  // Close on outside click ONLY if pinned
  useEffect(() => {
    const onDocMouseDown = () => {
      setHoverTip((prev) => {
        if (!prev) return prev;
        if (!prev.pinned) return prev;
        return null;
      });
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (tooltipCloseTimeoutRef.current) {
        clearTimeout(tooltipCloseTimeoutRef.current);
      }
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  const handleCellHover = useCallback((e, row, cat, value, count) => {
    // Clear any existing hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Small delay to prevent tooltip on quick mouse movements
    hoverTimeoutRef.current = setTimeout(() => {
      const items = getCellItems(row.start, row.end, cat);
      openHoverTip(
        e,
        `${row.label} • ${cat} • ${money(value)} (${count} item${count === 1 ? "" : "s"})`,
        items,
        false
      );
    }, 50);
  }, [getCellItems, money, openHoverTip]);
  
  const handleCellLeave = useCallback(() => {
    // Clear hover timeout if mouse leaves before delay completes
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    scheduleCloseHoverTip(100);
  }, [scheduleCloseHoverTip]);
  
  return (
    <motion.div
      className="card mb-4"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: "easeOut" }}
    >
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="mb-0">Purchases</h5>
          <div className="btn-group" role="group">
            <button
              className={`btn btn-sm ${viewMode === "weekly" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("weekly")}
            >
              Weekly
            </button>
            <button
              className={`btn btn-sm ${viewMode === "monthly" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("monthly")}
            >
              Monthly
            </button>
            <button
              className={`btn btn-sm ${viewMode === "yearly" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("yearly")}
            >
              Yearly
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`table-${viewMode}`}
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
          >
          {(() => {
          let rows = [];

          if (viewMode === "weekly") {
            rows = weekDays.map((day, idx) => {
              const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
              const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
              return {
                key: `day-${idx}-${toDateOnlyString(day)}`,
                label: `${dayNames[idx]} ${day.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`,
                start,
                end,
                isCurrent: toDateOnlyString(day) === toDateOnlyString(new Date()),
              };
            });
          } else if (viewMode === "monthly") {
            rows = monthWeeks.map((w) => {
              const now = new Date();
              return {
                key: `week-${w.num}-${toDateOnlyString(w.start)}`,
                label: `${w.label} (${w.start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}–${w.end.toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short" }
                )})`,
                start: w.start,
                end: new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59, 999),
                isCurrent: now >= w.start && now <= w.end,
              };
            });
          } else {
            rows = monthNames.map((mName, idx) => {
              const start = new Date(yearStart.getFullYear(), idx, 1);
              const end = new Date(yearStart.getFullYear(), idx + 1, 0, 23, 59, 59, 999);
              const now = new Date();
              return {
                key: `month-${idx}-${yearStart.getFullYear()}`,
                label: `${mName} ${yearStart.getFullYear()}`,
                start,
                end,
                isCurrent: now.getFullYear() === yearStart.getFullYear() && now.getMonth() === idx,
              };
            });
          }

          const grandTotals = {};
          for (const c of splitCategoryNames) grandTotals[c] = 0;
          let grandRowTotal = 0;

          const rowData = rows.map((row) => {
            const rangePurchases = getPurchasesInRange(row.start, row.end);
            const { totals, counts } = buildCategoryTotals(rangePurchases);
            const rowTotal = Object.values(totals).reduce((s, v) => s + (Number(v) || 0), 0);
            return { row, totals, counts, rowTotal };
          });

          const maxCellValue = rowData.reduce((max, r) => {
            const rowMax = Math.max(0, ...Object.values(r.totals).map((v) => Number(v) || 0));
            return Math.max(max, rowMax);
          }, 0);

          return (
            <>
              <div className="table-responsive" style={{ maxHeight: "650px", overflowY: "auto" }}>
                <table className="table table-sm mb-0 tracker-pivot-table" style={{ tableLayout: "fixed" }}>

                  <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ width: "220px" }}>Period</th>
                          {splitCategoryNames.map((cat) => (
                            <th
                              key={cat}
                              className="text-center tracker-cat-th"
                              title={cat}
                            >
                              <span className="tracker-cat-label">{cat}</span>
                            </th>
                          ))}

                      <th className="text-end" style={{ width: "120px" }}>
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rowData.map(({ row, totals, counts, rowTotal }) => {

                      for (const [cat, val] of Object.entries(totals)) {
                        grandTotals[cat] = (grandTotals[cat] || 0) + (Number(val) || 0);
                      }
                      grandRowTotal += rowTotal;

                      return (
                        <tr key={row.key} style={row.isCurrent ? { backgroundColor: "rgba(13, 110, 253, 0.06)" } : undefined}>
                          <td className="fw-semibold">{row.label}</td>

                          {splitCategoryNames.map((cat) => {
                            const value = totals[cat] || 0;
                            const count = counts[cat] || 0;
                            const intensity = maxCellValue > 0 ? Math.min(value / maxCellValue, 1) : 0;
                            const heatAlpha = value > 0 ? 0.08 + 0.35 * intensity : 0;

                            return (
                                    <td
                                      key={cat}
                                      className={`text-center tracker-cell tracker-heat-cell ${value > 0 ? "tracker-cell--has" : ""}`}
                                      style={
                                        value > 0
                                          ? { backgroundColor: `rgba(13, 110, 253, ${heatAlpha})` }
                                          : undefined
                                      }
                                    >
                                      {value > 0 ? (
                                        <button
                                          type="button"
                                          className="tracker-cell-btn"
                                          onMouseEnter={(e) => handleCellHover(e, row, cat, value, count)}
                                          onMouseLeave={handleCellLeave}
                                        >
                                          <div className="fw-bold">{formatMoney(value)}</div>
                                          <div className="text-body-secondary" style={{ fontSize: "0.75rem" }}>
                                            {count} item{count === 1 ? "" : "s"}
                                          </div>
                                        </button>
                                      ) : (
                                        <span className="text-body-secondary">—</span>
                                      )}
                                    </td>
                                  );

                          })}

                          <td className="text-end fw-bold">{formatMoney(rowTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot className="table-light" style={{ position: "sticky", bottom: 0, zIndex: 1 }}>
                    <tr>
                      <th>Totals</th>
                      {splitCategoryNames.map((cat) => (
                        <th key={cat} className="text-center">
                          {grandTotals[cat] > 0 ? formatMoney(grandTotals[cat]) : "—"}
                        </th>
                      ))}
                      <th className="text-end">{formatMoney(grandRowTotal)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
                {hoverTip && (
                  <div
                    className="tracker-hover-tip shadow"
                    style={{ left: hoverTip.x, top: hoverTip.y }}
                    role="dialog"
                    aria-label="Purchase details"
                    onMouseEnter={() => {
                      // Pin tooltip when hovering over it
                      if (hoverTip && !hoverTip.pinned) {
                        openHoverTip(
                          { clientX: hoverTip.x, clientY: hoverTip.y },
                          hoverTip.title,
                          hoverTip.items,
                          true
                        );
                      }
                    }}
                    onMouseLeave={() => {
                      // Schedule close with delay
                      scheduleCloseHoverTip(150);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="tracker-hover-header">
                      <div className="tracker-hover-title">{hoverTip.title}</div>

                      {hoverTip.pinned && (
                        <button
                          type="button"
                          className="tracker-hover-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeHoverTip();
                          }}
                          aria-label="Close"
                          title="Close"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    
                    {!hoverTip.pinned && (
                      <div className="tracker-hover-hint">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Hover over this panel to scroll through all items
                      </div>
                    )}

                    {hoverTip.items?.length ? (
                      <div className="tracker-hover-list">
                        {hoverTip.items.map((it) => (
                          <div key={it.id} className="tracker-hover-row">
                            <div className="tracker-hover-desc" title={it.description}>
                              {it.description}
                            </div>
                            <div className="tracker-hover-amt">{money(it.amount)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="tracker-hover-empty">No items</div>
                    )}
                  </div>
                )}



              <div className="mt-2 text-end fw-bold">
                {viewMode === "yearly" ? "Year Total" : viewMode === "monthly" ? "Month Total" : "Week Total"}: £
                {getViewTotal.toFixed(2)}
                  </div>
                </>
              );
            })()}
            </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
  );
}

export default React.memo(PurchasesPivotTable);
