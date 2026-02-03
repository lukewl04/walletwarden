import React from "react";
import { Link } from "react-router-dom";

export default function TrackerHeader({
  savedSplits,
  selectedSplit,
  setSelectedSplit,
}) {
  return (
    <div className="mb-4">
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
                Choose a split
              </option>
              {savedSplits.map((split) => (
                <option key={split.id} value={split.id}>
                  {split.name} ({split.frequency})
                </option>
              ))}
            </select>
          </div>
          <Link className="btn btn-sm btn-primary rounded-3" to="/splitmaker">
            Split Maker
          </Link>
          <h1 className="h4 mb-0 ms-auto">
            Warden <span className="text-primary">Tracker</span>
          </h1>
        </div>
      )}
    </div>
  );
}
