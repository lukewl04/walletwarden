import React from "react";

export default function TrackerHeader({
  savedSplits,
  selectedSplit,
  setSelectedSplit,
  syncMessage,
  unlinkedTransactionsCount,
  handleImportFromWardenInsights,
  isImportingFromInsights,
}) {
  return (
    <div className="mb-4">
      {syncMessage && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          {syncMessage}
        </div>
      )}

      {savedSplits.length === 0 ? (
        <div className="alert alert-info">No saved splits found. Create a split on the Split Maker page first!</div>
      ) : (
        <div className="d-flex gap-3 align-items-end mb-3 flex-wrap">
          <div>
            <label className="form-label small fw-semibold">Select Split</label>
            <select
              className="form-select form-select-sm"
              value={selectedSplit || ""}
              onChange={(e) => setSelectedSplit(e.target.value)}
              style={{ minWidth: "180px" }}
            >
              <option value="" disabled>
                Choose a split…
              </option>
              {savedSplits.map((split) => (
                <option key={split.id} value={split.id}>
                  {split.name} ({split.frequency})
                </option>
              ))}
            </select>
          </div>
          <h1 className="h4 mb-0 ms-auto">
            Warden <span className="text-primary">Tracker</span>
          </h1>
        </div>
      )}

      {unlinkedTransactionsCount > 0 && selectedSplit && (
        <div className="alert alert-warning mb-3" role="alert">
          <div className="d-flex align-items-center justify-content-between gap-3">
            <div>
              <strong>
                📥 {unlinkedTransactionsCount} transaction{unlinkedTransactionsCount !== 1 ? "s" : ""}
              </strong>{" "}
              from Warden Insights {unlinkedTransactionsCount !== 1 ? "are" : "is"} not linked to this split yet.
              <br />
              <small className="text-body-secondary">
                Click "Import Now" to automatically categorize and add them to this split.
              </small>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleImportFromWardenInsights}
              disabled={isImportingFromInsights}
              style={{ whiteSpace: "nowrap" }}
            >
              {isImportingFromInsights ? "Importing..." : "Import Now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
