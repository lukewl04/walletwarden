import React, { useMemo, useRef, useState, useEffect, useCallback, useDeferredValue, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Memoized table row component to prevent unnecessary re-renders
const TableRow = React.memo(function TableRow({ 
  row, 
  totals, 
  counts, 
  rowTotal, 
  maxCellValue, 
  splitCategoryNames, 
  formatMoney, 
  handleCellHover, 
  handleCellLeave 
}) {
  return (
    <tr style={row.isCurrent ? { backgroundColor: "rgba(13, 110, 253, 0.06)" } : undefined}>
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
            style={value > 0 ? { backgroundColor: `rgba(13, 110, 253, ${heatAlpha})` } : undefined}
          >
            {value > 0 ? (
              <button
                type="button"
                className="tracker-cell-btn"
                onMouseEnter={(e) => handleCellHover(e, row, cat, value, count)}
                onMouseLeave={(e) => handleCellLeave(e)}
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
});

// Loading skeleton for the table
const TableSkeleton = React.memo(function TableSkeleton({ rowCount = 7, colCount = 5 }) {
  return (
    <div className="table-responsive" style={{ maxHeight: "650px", overflowY: "auto" }}>
      <table className="table table-sm mb-0 tracker-pivot-table" style={{ tableLayout: "fixed" }}>
        <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
          <tr>
            <th style={{ width: "220px" }}>Period</th>
            {Array.from({ length: colCount }).map((_, i) => (
              <th key={i} className="text-center">
                <div className="placeholder-glow">
                  <span className="placeholder col-8"></span>
                </div>
              </th>
            ))}
            <th className="text-end" style={{ width: "120px" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              <td>
                <div className="placeholder-glow">
                  <span className="placeholder col-10"></span>
                </div>
              </td>
              {Array.from({ length: colCount }).map((_, colIdx) => (
                <td key={colIdx} className="text-center">
                  <div className="placeholder-glow">
                    <span className="placeholder col-6"></span>
                  </div>
                </td>
              ))}
              <td className="text-end">
                <div className="placeholder-glow">
                  <span className="placeholder col-8"></span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

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
  handleUpdatePurchaseCategory,
  editingPurchaseId,
  setEditingPurchaseId,
  allCategoryNames,
}) {
  // ===== Hover tooltip state (isolated to prevent parent re-renders) =====
  const [hoverTip, setHoverTip] = useState(null);
  const tooltipCloseTimeoutRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const tooltipRef = useRef(null);
  const isMouseOverTooltipRef = useRef(false);
  const currentCellRef = useRef(null); // Track which cell triggered the tooltip

  // Open hover tooltip with position calculation (only repositions on new cell)
  // Stores cell query parameters instead of snapshot data so items are derived at render time.
  const openHoverTip = useCallback((evt, rowLabel, categoryName, start, end, pinned = false, cellKey = null) => {
    // Clear any pending close timeout
    if (tooltipCloseTimeoutRef.current) {
      clearTimeout(tooltipCloseTimeoutRef.current);
      tooltipCloseTimeoutRef.current = null;
    }

    // If just pinning an existing tooltip (same cell), don't recalculate position
    if (pinned && hoverTip && cellKey && cellKey === currentCellRef.current) {
      setHoverTip((prev) => prev ? { ...prev, pinned: true } : null);
      return;
    }

    // Track which cell this tooltip is for
    if (cellKey) {
      currentCellRef.current = cellKey;
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
    
    setHoverTip({ x, y, rowLabel, categoryName, start, end, pinned });
  }, [hoverTip]);

  const closeHoverTip = useCallback(() => {
    if (tooltipCloseTimeoutRef.current) {
      clearTimeout(tooltipCloseTimeoutRef.current);
      tooltipCloseTimeoutRef.current = null;
    }
    currentCellRef.current = null;
    isMouseOverTooltipRef.current = false;
    setHoverTip(null);
  }, []);

  const scheduleCloseHoverTip = useCallback((delay = 200) => {
    if (tooltipCloseTimeoutRef.current) {
      clearTimeout(tooltipCloseTimeoutRef.current);
    }
    tooltipCloseTimeoutRef.current = setTimeout(() => {
      // Don't close if mouse is over the tooltip
      if (isMouseOverTooltipRef.current) return;
      setHoverTip((prev) => {
        if (!prev || prev.pinned) return prev;
        return null;
      });
    }, delay);
  }, []);

  // Cancel close when entering tooltip
  const handleTooltipMouseEnter = useCallback(() => {
    isMouseOverTooltipRef.current = true;
    if (tooltipCloseTimeoutRef.current) {
      clearTimeout(tooltipCloseTimeoutRef.current);
      tooltipCloseTimeoutRef.current = null;
    }
    // Pin the tooltip so it stays open
    setHoverTip((prev) => prev ? { ...prev, pinned: true } : null);
  }, []);

  // Schedule close when leaving tooltip
  const handleTooltipMouseLeave = useCallback((e) => {
    isMouseOverTooltipRef.current = false;
    // Check if we're moving back to a table cell (part of hover zone)
    const relatedTarget = e.relatedTarget;
    const isMovingToCell = relatedTarget?.closest?.('.pivot-body td');
    if (isMovingToCell) {
      // Don't close immediately, let the cell hover handler decide
      return;
    }
    scheduleCloseHoverTip(200);
  }, [scheduleCloseHoverTip]);

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
    // Generate a unique key for this cell
    const cellKey = `${row.key}-${cat}`;
    
    // If we're already showing a tooltip for this cell, just cancel any close timeout
    if (currentCellRef.current === cellKey && hoverTip) {
      if (tooltipCloseTimeoutRef.current) {
        clearTimeout(tooltipCloseTimeoutRef.current);
        tooltipCloseTimeoutRef.current = null;
      }
      return;
    }
    
    // Clear any existing hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Clear any pending close timeout
    if (tooltipCloseTimeoutRef.current) {
      clearTimeout(tooltipCloseTimeoutRef.current);
      tooltipCloseTimeoutRef.current = null;
    }
    
    // Small delay to prevent tooltip on quick mouse movements
    hoverTimeoutRef.current = setTimeout(() => {
      openHoverTip(
        e,
        row.label,
        cat,
        row.start,
        row.end,
        false,
        cellKey
      );
    }, 50);
  }, [openHoverTip, hoverTip]);
  
  const handleCellLeave = useCallback((e) => {
    // Clear hover timeout if mouse leaves before delay completes
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Check if we're moving to the tooltip itself
    const relatedTarget = e.relatedTarget;
    const tooltipEl = tooltipRef.current;
    if (tooltipEl && (relatedTarget === tooltipEl || tooltipEl.contains(relatedTarget))) {
      // Moving to tooltip, don't close
      return;
    }
    
    // Also check if moving to another cell
    const isMovingToAnotherCell = relatedTarget?.closest?.('.pivot-body td');
    if (isMovingToAnotherCell) {
      // Let the new cell's hover handler take over
      return;
    }
    
    scheduleCloseHoverTip(200);
  }, [scheduleCloseHoverTip]);
  
  // Use deferred value for smoother UI - data can lag behind while UI stays responsive
  const deferredSplitCategoryNames = useDeferredValue(splitCategoryNames);
  const [isPending, startTransition] = useTransition();
  
  // Track if we have initial data loaded
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Memoize rows computation to avoid recalculating on every render
  const rows = useMemo(() => {
    if (viewMode === "weekly") {
      return weekDays.map((day, idx) => {
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
      const now = new Date();
      return monthWeeks.map((w) => ({
        key: `week-${w.num}-${toDateOnlyString(w.start)}`,
        label: `${w.label} (${w.start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}–${w.end.toLocaleDateString(
          "en-GB",
          { day: "numeric", month: "short" }
        )})`,
        start: w.start,
        end: new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59, 999),
        isCurrent: now >= w.start && now <= w.end,
      }));
    } else {
      const now = new Date();
      return monthNames.map((mName, idx) => {
        const start = new Date(yearStart.getFullYear(), idx, 1);
        const end = new Date(yearStart.getFullYear(), idx + 1, 0, 23, 59, 59, 999);
        return {
          key: `month-${idx}-${yearStart.getFullYear()}`,
          label: `${mName} ${yearStart.getFullYear()}`,
          start,
          end,
          isCurrent: now.getFullYear() === yearStart.getFullYear() && now.getMonth() === idx,
        };
      });
    }
  }, [viewMode, weekDays, dayNames, monthWeeks, monthNames, yearStart, toDateOnlyString]);

  // Memoize all row data calculations to avoid recomputing on every render
  const { rowData, maxCellValue, grandTotals, grandRowTotal } = useMemo(() => {
    const grandTotals = {};
    for (const c of deferredSplitCategoryNames) grandTotals[c] = 0;
    let grandRowTotal = 0;

    const rowData = rows.map((row) => {
      const rangePurchases = getPurchasesInRange(row.start, row.end);
      const { totals, counts } = buildCategoryTotals(rangePurchases);
      const rowTotal = Object.values(totals).reduce((s, v) => s + (Number(v) || 0), 0);
      
      // Accumulate grand totals
      for (const [cat, val] of Object.entries(totals)) {
        grandTotals[cat] = (grandTotals[cat] || 0) + (Number(val) || 0);
      }
      grandRowTotal += rowTotal;
      
      return { row, totals, counts, rowTotal };
    });

    const maxCellValue = rowData.reduce((max, r) => {
      const rowMax = Math.max(0, ...Object.values(r.totals).map((v) => Number(v) || 0));
      return Math.max(max, rowMax);
    }, 0);

    return { rowData, maxCellValue, grandTotals, grandRowTotal };
  }, [rows, deferredSplitCategoryNames, getPurchasesInRange, buildCategoryTotals]);

  // Mark initial load complete once we have data
  useEffect(() => {
    if (rowData.length > 0 && isInitialLoad) {
      startTransition(() => {
        setIsInitialLoad(false);
      });
    }
  }, [rowData, isInitialLoad]);
  
  // Determine row count for skeleton based on view mode
  const skeletonRowCount = viewMode === "weekly" ? 7 : viewMode === "monthly" ? 5 : 12;
  const showSkeleton = isInitialLoad && rowData.length === 0;

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
          <div className="segmented-control">
            <button
              className={`segmented-control__segment ${viewMode === "weekly" ? "segmented-control__segment--active" : ""}`}
              onClick={() => setViewMode("weekly")}
            >
              Weekly
            </button>
            <button
              className={`segmented-control__segment ${viewMode === "monthly" ? "segmented-control__segment--active" : ""}`}
              onClick={() => setViewMode("monthly")}
            >
              Monthly
            </button>
            <button
              className={`segmented-control__segment ${viewMode === "yearly" ? "segmented-control__segment--active" : ""}`}
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
              {showSkeleton ? (
                <TableSkeleton rowCount={skeletonRowCount} colCount={deferredSplitCategoryNames.length || 5} />
              ) : (
              <>
              <div className="table-responsive" style={{ maxHeight: "650px", overflowY: "auto" }}>
                <table className="table table-sm mb-0 tracker-pivot-table" style={{ tableLayout: "fixed" }}>

                  <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ width: "220px" }}>Period</th>
                          {deferredSplitCategoryNames.map((cat) => (
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
                    {rowData.map(({ row, totals, counts, rowTotal }) => (
                        <TableRow
                          key={row.key}
                          row={row}
                          totals={totals}
                          counts={counts}
                          rowTotal={rowTotal}
                          maxCellValue={maxCellValue}
                          splitCategoryNames={deferredSplitCategoryNames}
                          formatMoney={formatMoney}
                          handleCellHover={handleCellHover}
                          handleCellLeave={handleCellLeave}
                        />
                      ))}
                  </tbody>

                  <tfoot className="table-light" style={{ position: "sticky", bottom: 0, zIndex: 1 }}>
                    <tr>
                      <th>Totals</th>
                      {deferredSplitCategoryNames.map((cat) => (
                        <th key={cat} className="text-center">
                          {grandTotals[cat] > 0 ? formatMoney(grandTotals[cat]) : "—"}
                        </th>
                      ))}
                      <th className="text-end">{formatMoney(grandRowTotal)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
                {hoverTip && (() => {
                  // Derive tooltip data from the source of truth on every render
                  const tooltipItems = getCellItems(hoverTip.start, hoverTip.end, hoverTip.categoryName);
                  const tooltipValue = tooltipItems.reduce((s, it) => s + it.amount, 0);
                  const tooltipCount = tooltipItems.length;
                  const tooltipTitle = `${hoverTip.rowLabel} • ${hoverTip.categoryName} • ${money(tooltipValue)} (${tooltipCount} item${tooltipCount === 1 ? "" : "s"})`;

                  return (
                  <div
                    ref={tooltipRef}
                    className="tracker-hover-tip shadow"
                    style={{ left: hoverTip.x, top: hoverTip.y }}
                    role="dialog"
                    aria-label="Purchase details"
                    onMouseEnter={handleTooltipMouseEnter}
                    onMouseLeave={handleTooltipMouseLeave}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="tracker-hover-header">
                      <div className="tracker-hover-title">{tooltipTitle}</div>

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

                    {tooltipItems.length ? (
                      <div className="tracker-hover-list">
                        {tooltipItems.map((it) => (
                          <div key={it.id} className="tracker-hover-row" style={{ alignItems: "center" }}>
                            <div className="tracker-hover-desc" title={it.description} style={{ flex: 1, minWidth: 0 }}>
                              {it.description}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                              {editingPurchaseId === it.id ? (
                                <select
                                  className="form-select form-select-sm"
                                  style={{ width: "120px", fontSize: "0.75rem", padding: "2px 4px" }}
                                  value={it.category || "Other"}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleUpdatePurchaseCategory(it.id, e.target.value);
                                  }}
                                  onBlur={() => setTimeout(() => setEditingPurchaseId(null), 150)}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  autoFocus
                                >
                                  {(allCategoryNames || splitCategoryNames || []).map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  type="button"
                                  className="badge text-bg-secondary"
                                  style={{ fontSize: "0.65rem", border: "none", cursor: "pointer", padding: "2px 6px", whiteSpace: "nowrap", opacity: 0.6, fontWeight: 400 }}
                                  onClick={(e) => { e.stopPropagation(); setEditingPurchaseId(it.id); }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  title="Click to change category"
                                >
                                  {it.category || "Other"}
                                </button>
                              )}
                              <div className="tracker-hover-amt">{money(it.amount)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="tracker-hover-empty">No items</div>
                    )}
                  </div>
                  );
                })()}



              <div className="mt-2 text-end fw-bold">
                {viewMode === "yearly" ? "Year Total" : viewMode === "monthly" ? "Month Total" : "Week Total"}: £
                {getViewTotal.toFixed(2)}
                  </div>
                </>
              )}
            </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
  );
}

export default React.memo(PurchasesPivotTable);
