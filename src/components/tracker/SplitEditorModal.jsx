import React, { useState, useEffect, useRef } from "react";

// Modal overlay styles matching Insights dark theme
const modalStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1050,
    padding: "1rem",
  },
  panel: {
    backgroundColor: "rgba(15, 23, 42, 0.98)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    width: "100%",
    maxWidth: "480px",
    maxHeight: "90vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1.25rem 1.5rem",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  },
  title: {
    margin: 0,
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "#e2e8f0",
  },
  closeButton: {
    background: "transparent",
    border: "none",
    padding: "0.5rem",
    cursor: "pointer",
    color: "#94a3b8",
    borderRadius: "8px",
    transition: "background-color 150ms ease, color 150ms ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: "1.5rem",
    overflowY: "auto",
    flex: 1,
  },
  footer: {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "flex-end",
    padding: "1rem 1.5rem",
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  label: {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "#94a3b8",
    marginBottom: "0.5rem",
  },
  input: {
    width: "100%",
    padding: "0.625rem 0.875rem",
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontSize: "0.9375rem",
    outline: "none",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
  },
  categoryRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.75rem",
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    borderRadius: "10px",
    marginBottom: "0.5rem",
  },
  categoryName: {
    flex: 1,
    fontSize: "0.9375rem",
    color: "#e2e8f0",
    fontWeight: 500,
  },
  percentInput: {
    width: "72px",
    padding: "0.5rem 0.625rem",
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    color: "#e2e8f0",
    fontSize: "0.875rem",
    textAlign: "right",
    outline: "none",
  },
  percentSymbol: {
    fontSize: "0.875rem",
    color: "#64748b",
    marginLeft: "-0.25rem",
  },
  totalRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.875rem 0.75rem",
    marginTop: "0.5rem",
    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
  },
  totalLabel: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#94a3b8",
  },
  totalValue: {
    fontSize: "0.9375rem",
    fontWeight: 700,
  },
  button: {
    padding: "0.625rem 1.25rem",
    borderRadius: "8px",
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 150ms ease",
    border: "none",
  },
  buttonSecondary: {
    backgroundColor: "rgba(51, 65, 85, 0.8)",
    color: "#e2e8f0",
  },
  buttonPrimary: {
    backgroundColor: "rgba(59, 130, 246, 0.9)",
    color: "#ffffff",
  },
  buttonDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    color: "#f87171",
    border: "1px solid rgba(239, 68, 68, 0.3)",
  },
  deleteSection: {
    marginTop: "1.5rem",
    paddingTop: "1.25rem",
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
  },
  dangerZone: {
    padding: "1rem",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    borderRadius: "10px",
  },
  dangerTitle: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "#f87171",
    marginBottom: "0.5rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  dangerText: {
    fontSize: "0.8125rem",
    color: "#94a3b8",
    marginBottom: "0.75rem",
  },
  confirmBox: {
    marginTop: "1rem",
    padding: "1rem",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: "8px",
    border: "1px solid rgba(239, 68, 68, 0.25)",
  },
  confirmText: {
    fontSize: "0.875rem",
    color: "#fca5a5",
    marginBottom: "0.75rem",
    fontWeight: 500,
  },
  confirmButtons: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
  },
  validationError: {
    padding: "0.625rem 0.875rem",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    borderRadius: "8px",
    fontSize: "0.8125rem",
    color: "#f87171",
    textAlign: "center",
  },
};

// Close icon
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function SplitEditorModal({
  isOpen,
  onClose,
  split,
  allSplits,
  onSave,
  onDelete,
}) {
  const [name, setName] = useState("");
  const [categories, setCategories] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isHoveringClose, setIsHoveringClose] = useState(false);
  const nameInputRef = useRef(null);

  // Initialize form when split changes
  useEffect(() => {
    if (split) {
      setName(split.name || "");
      setCategories(
        (split.categories || []).map((cat) => ({
          ...cat,
          percent: Number(cat.percent) || 0,
        }))
      );
      setShowDeleteConfirm(false);
    }
  }, [split]);

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !split) return null;

  const handlePercentChange = (categoryId, value) => {
    const numValue = Math.max(0, Math.min(100, Number(value) || 0));
    setCategories((prev) =>
      prev.map((cat) => (cat.id === categoryId ? { ...cat, percent: numValue } : cat))
    );
  };

  const totalPercent = categories.reduce((sum, cat) => sum + (Number(cat.percent) || 0), 0);
  const isValidTotal = Math.abs(totalPercent - 100) < 0.01;
  const isOverAllocated = totalPercent > 100;

  // Shared error message for consistency
  const allocationErrorMessage = "Allocations must total 100%";

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      nameInputRef.current?.focus();
      return;
    }
    if (!isValidTotal) {
      return;
    }
    onSave({
      ...split,
      name: trimmedName,
      categories,
    });
  };

  const handleDelete = () => {
    onDelete(split.id);
  };

  const canDelete = allSplits.length > 1;

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>Edit Split</h2>
          <button
            style={{
              ...modalStyles.closeButton,
              ...(isHoveringClose ? { backgroundColor: "rgba(255, 255, 255, 0.1)", color: "#e2e8f0" } : {}),
            }}
            onClick={onClose}
            onMouseEnter={() => setIsHoveringClose(true)}
            onMouseLeave={() => setIsHoveringClose(false)}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Top validation error - fixed height container to prevent layout shift */}
        <div style={{ 
          padding: "0 1.5rem", 
          paddingTop: "1rem",
          height: "52px", // Fixed height to reserve space
          boxSizing: "border-box",
        }}>
          <div style={{
            ...modalStyles.validationError,
            opacity: isOverAllocated ? 1 : 0,
            visibility: isOverAllocated ? "visible" : "hidden",
            transition: "opacity 150ms ease",
          }}>
            {allocationErrorMessage}
          </div>
        </div>

        {/* Body */}
        <div style={modalStyles.body}>
          {/* Name field */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={modalStyles.label}>Split Name</label>
            <input
              ref={nameInputRef}
              type="text"
              style={modalStyles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter split name..."
              onFocus={(e) => {
                e.target.style.borderColor = "rgba(59, 130, 246, 0.5)";
                e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.15)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Categories */}
          <div>
            <label style={modalStyles.label}>Category Allocations</label>
            {categories.map((cat) => (
              <div key={cat.id} style={modalStyles.categoryRow}>
                <span style={modalStyles.categoryName}>{cat.name}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  style={modalStyles.percentInput}
                  value={cat.percent}
                  onChange={(e) => handlePercentChange(cat.id, e.target.value)}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(59, 130, 246, 0.5)";
                    e.target.select();
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                  }}
                />
                <span style={modalStyles.percentSymbol}>%</span>
              </div>
            ))}

            {/* Total row */}
            <div style={modalStyles.totalRow}>
              <span style={modalStyles.totalLabel}>Total</span>
              <span
                style={{
                  ...modalStyles.totalValue,
                  color: isValidTotal ? "#4ade80" : "#f87171",
                }}
              >
                {totalPercent.toFixed(0)}%
              </span>
            </div>
            {!isValidTotal && (
              <div style={{ fontSize: "0.8125rem", color: "#f87171", marginTop: "0.5rem", textAlign: "right" }}>
                {allocationErrorMessage}
              </div>
            )}
          </div>

          {/* Delete section */}
          <div style={modalStyles.deleteSection}>
            <div style={modalStyles.dangerZone}>
              <div style={modalStyles.dangerTitle}>Danger Zone</div>
              <p style={modalStyles.dangerText}>
                Deleting this split will remove all associated data. This action cannot be undone.
              </p>
              {!canDelete ? (
                <div style={{ fontSize: "0.8125rem", color: "#94a3b8", fontStyle: "italic" }}>
                  You cannot delete your only split. Create another split first.
                </div>
              ) : !showDeleteConfirm ? (
                <button
                  style={{ ...modalStyles.button, ...modalStyles.buttonDanger, width: "100%" }}
                  onClick={() => setShowDeleteConfirm(true)}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "rgba(239, 68, 68, 0.25)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
                  }}
                >
                  Delete Split
                </button>
              ) : (
                <div style={modalStyles.confirmBox}>
                  <div style={modalStyles.confirmText}>
                    Are you sure you want to delete "{split.name}"?
                  </div>
                  <div style={modalStyles.confirmButtons}>
                    <button
                      style={{ ...modalStyles.button, ...modalStyles.buttonSecondary, padding: "0.5rem 1rem" }}
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      style={{
                        ...modalStyles.button,
                        backgroundColor: "#dc2626",
                        color: "#fff",
                        padding: "0.5rem 1rem",
                      }}
                      onClick={handleDelete}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = "#b91c1c";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = "#dc2626";
                      }}
                    >
                      Yes, Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={modalStyles.footer}>
          <button
            style={{ ...modalStyles.button, ...modalStyles.buttonSecondary }}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "rgba(71, 85, 105, 0.8)";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "rgba(51, 65, 85, 0.8)";
            }}
          >
            Cancel
          </button>
          <button
            style={{
              ...modalStyles.button,
              ...modalStyles.buttonPrimary,
              opacity: !name.trim() || !isValidTotal ? 0.5 : 1,
              cursor: !name.trim() || !isValidTotal ? "not-allowed" : "pointer",
            }}
            onClick={handleSave}
            disabled={!name.trim() || !isValidTotal}
            onMouseEnter={(e) => {
              if (name.trim() && isValidTotal) {
                e.target.style.backgroundColor = "rgba(37, 99, 235, 0.95)";
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "rgba(59, 130, 246, 0.9)";
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
