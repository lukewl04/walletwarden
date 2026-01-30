import React from "react";
import { motion } from "framer-motion";

export default function IncomeCard({
  prefersReducedMotion,
  openExpectedIncomeModal,
  isUsingExpectedIncome,
  selectedIncomeSettings,
  viewIncomeTransactions,
  viewMode,
  toLocalDate,
  formatDisplayDate,
}) {
  return (
    <motion.div
      className="card shadow-sm mb-3 tracker-card-hover"
      whileHover={prefersReducedMotion ? undefined : { y: -2, boxShadow: "0 10px 24px rgba(13,110,253,0.12)" }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
    >
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <div className="d-flex align-items-center gap-2">
            <h5 className="mb-0">Income</h5>
            <button className="btn btn-sm btn-outline-secondary" onClick={openExpectedIncomeModal} title="Set expected income for budgeting">
              ⚙️ Expected
            </button>
          </div>
          <span className="badge fs-6" style={{ backgroundColor: "var(--tracker-accent-bg)", color: "#000000" }}>
            £{viewIncomeTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0).toFixed(2)}
          </span>
        </div>

        {isUsingExpectedIncome && selectedIncomeSettings && (
          <div className="alert alert-info py-2 mb-3">
            <small>
              📊 <strong>Using expected income:</strong> £{selectedIncomeSettings.expected_amount?.toFixed(2)}
              {selectedIncomeSettings.next_payday && (
                <span className="ms-2">
                  (next payday:{" "}
                  {new Date(selectedIncomeSettings.next_payday + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })})
                </span>
              )}
            </small>
          </div>
        )}

        {viewIncomeTransactions.length === 0 ? (
          <div className="text-body-secondary small">
            No income recorded for this {viewMode === "yearly" ? "year" : viewMode === "monthly" ? "month" : "week"}.
          </div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: "140px", overflowY: "auto" }}>
            <table className="table table-sm table-hover mb-0">
              <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ width: "120px" }}>Date</th>
                  <th style={{ width: "120px" }} className="text-end">
                    Amount
                  </th>
                  <th style={{ width: "160px" }}>Category</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {viewIncomeTransactions
                  .slice()
                  .sort((a, b) => toLocalDate(b.date) - toLocalDate(a.date))
                  .map((tx) => (
                    <tr key={tx.id}>
                      <td>{formatDisplayDate(tx.date)}</td>
                      <td className="text-end fw-bold">£{Number(tx.amount || 0).toFixed(2)}</td>
                      <td>
                        <span className="badge text-bg-secondary">{tx.category || "Income"}</span>
                      </td>
                      <td className="text-light">{tx.description || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
