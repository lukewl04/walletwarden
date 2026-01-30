import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function SummaryCard({
  selectedSplitData,
  viewMode,
  prefersReducedMotion,
  getViewTotal,
  viewBudgetIncome,
  viewUsingExpectedIncome,
  getViewPurchases,
}) {
  if (!selectedSplitData) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`summary-${viewMode}`}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
        className="card mb-4 shadow-sm"
        style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--card-border)", overflowX: "auto" }}
      >
        <div className="card-body py-3 px-3">
          <div className="d-flex align-items-stretch gap-3" style={{ minWidth: "max-content" }}>
            <div className="d-flex flex-column justify-content-center" style={{ minWidth: "110px", flexShrink: 0 }}>
              <span
                className="fw-semibold text-primary"
                style={{
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  opacity: 0.8,
                }}
              >
                {viewMode === "yearly" ? "Yearly" : viewMode === "monthly" ? "Monthly" : "Weekly"} Summary
              </span>
              <span className="fw-bold" style={{ fontSize: "1.25rem" }}>
                £{getViewTotal.toFixed(2)}
              </span>
              <span className="text-primary" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                of £{viewBudgetIncome.toFixed(2)} income
                {viewUsingExpectedIncome && (
                  <span className="badge bg-warning text-dark ms-1" style={{ fontSize: "0.65rem" }}>
                    Est.
                  </span>
                )}
              </span>
            </div>

            <div className="vr d-none d-sm-block" style={{ height: "50px", alignSelf: "center", flexShrink: 0 }} />

            {selectedSplitData.categories.map((cat) => {
              const categoryPurchases = getViewPurchases().filter((p) => p.category === cat.name);
              const categoryTotal = categoryPurchases.reduce((sum, p) => sum + p.amount, 0);
              const allocatedAmount = viewBudgetIncome > 0 ? (viewBudgetIncome * cat.percent) / 100 : 0;
              const percentUsed = allocatedAmount > 0 ? (categoryTotal / allocatedAmount) * 100 : 0;
              const remaining = allocatedAmount - categoryTotal;
              const progressWidth = Math.min(percentUsed, 100);

              return (
                <motion.div
                  key={cat.id}
                  className="d-flex flex-column justify-content-center tracker-summary-item"
                  style={{ minWidth: "90px", flexShrink: 0 }}
                  whileHover={prefersReducedMotion ? undefined : { y: -3 }}
                  transition={{ type: "spring", stiffness: 250, damping: 20 }}
                  title={`${cat.name}: £${categoryTotal.toFixed(2)} of £${allocatedAmount.toFixed(2)}`}
                >
                  <span className="text-primary fw-medium" style={{ fontSize: "0.75rem", marginBottom: "2px", whiteSpace: "nowrap", opacity: 0.8 }}>
                    {cat.name} <span style={{ opacity: 0.7 }}>({cat.percent}%)</span>
                  </span>
                  <div className="d-flex align-items-baseline gap-1">
                    <span className="fw-bold" style={{ fontSize: "0.9rem" }}>
                      £{categoryTotal.toFixed(2)}
                    </span>
                    <span className="text-primary" style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                      / £{allocatedAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="progress" style={{ height: "4px", width: "100%", marginTop: "4px", marginBottom: "4px" }}>
                    <motion.div
                      className={`progress-bar tracker-progress-fill ${percentUsed > 100 ? "tracker-glow-over" : percentUsed > 80 ? "bg-warning" : ""}`}
                      initial={prefersReducedMotion ? false : { width: 0 }}
                      animate={{ width: `${progressWidth}%` }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: "easeOut" }}
                      style={{ backgroundColor: percentUsed <= 80 ? "var(--tracker-budget-ok)" : undefined }}
                    />
                  </div>
                  <span className="fw-medium" style={{ fontSize: "0.7rem", whiteSpace: "nowrap", color: remaining < 0 ? "var(--bs-danger)" : "var(--tracker-budget-ok)" }}>
                    {remaining >= 0 ? `£${remaining.toFixed(2)} left` : `-£${Math.abs(remaining).toFixed(2)} over`}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
