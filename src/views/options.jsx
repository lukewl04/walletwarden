import React, { useState } from "react";
import Navbar from "../components/navbar.jsx";
import { useTransactions } from "../state/TransactionsContext";

export default function Options() {
  const { clearTransactions } = useTransactions();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const handleResetClick = () => {
    setShowConfirmModal(true);
  };

  const confirmReset = async () => {
    try {
      await clearTransactions();
      setResetMessage("All transactions have been cleared successfully!");
      setShowConfirmModal(false);
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setResetMessage("");
      }, 3000);
    } catch (error) {
      console.error("Error clearing transactions:", error);
      setResetMessage("Error clearing transactions. Please try again.");
    }
  };

  return (
    <div className="container py-4 mt-5" style={{ maxWidth: 600, minHeight: "100vh" }}>
      <Navbar />

      <div className="mb-4">
        <h1 className="h3 mb-1">Options</h1>
        <p className="text-muted">Manage your Wallet Warden settings</p>
      </div>

      {resetMessage && (
        <div className={`alert alert-${resetMessage.includes("Error") ? "danger" : "success"} alert-dismissible fade show`} role="alert">
          {resetMessage}
          <button
            type="button"
            className="btn-close"
            onClick={() => setResetMessage("")}
          />
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="card-title mb-3">Data Management</h5>
          <p className="text-muted mb-4">
            Use these options to manage your transaction data.
          </p>

          <div className="d-grid gap-2">
            <button
              className="btn btn-outline-danger"
              onClick={handleResetClick}
            >
              🗑️ Clear All Transactions
            </button>
          </div>
          <p className="text-muted small mt-3 mb-0">
            This will permanently delete all your transactions from both local storage and the server. This action cannot be undone.
          </p>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="modal d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          role="dialog"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-danger">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">⚠️ Confirm Reset</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowConfirmModal(false)}
                />
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  Are you sure you want to delete <strong>all transactions</strong>? This action is permanent and cannot be undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowConfirmModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmReset}
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
