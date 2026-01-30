import React from "react";

export default function ExpectedIncomeModal({
  showExpectedIncomeModal,
  setShowExpectedIncomeModal,
  expectedIncomeForm,
  setExpectedIncomeForm,
  selectedSplitData,
  selectedIncomeSettings,
  handleSaveExpectedIncome,
}) {
  if (!showExpectedIncomeModal) return null;

  return (
    <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Expected Income Settings</h5>
            <button type="button" className="btn-close" onClick={() => setShowExpectedIncomeModal(false)} />
          </div>
          <div className="modal-body">
            <p className="text-body-secondary mb-3">
              Set expected income for <strong>{selectedSplitData?.name || "this split"}</strong>. This will be used for budget calculations when no
              actual income has been imported yet.
            </p>

            <div className="mb-3">
              <label className="form-label">Expected Amount (£)</label>
              <input
                type="number"
                className="form-control"
                value={expectedIncomeForm.expected_amount}
                onChange={(e) => setExpectedIncomeForm((prev) => ({ ...prev, expected_amount: e.target.value }))}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Next Payday</label>
              <input
                type="date"
                className="form-control"
                value={expectedIncomeForm.next_payday}
                onChange={(e) => setExpectedIncomeForm((prev) => ({ ...prev, next_payday: e.target.value }))}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Pay Frequency</label>
              <select
                className="form-select"
                value={expectedIncomeForm.frequency}
                onChange={(e) => setExpectedIncomeForm((prev) => ({ ...prev, frequency: e.target.value }))}
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="form-check mb-3">
              <input
                type="checkbox"
                className="form-check-input"
                id="useExpectedCheckbox"
                checked={expectedIncomeForm.use_expected_when_no_actual}
                onChange={(e) =>
                  setExpectedIncomeForm((prev) => ({ ...prev, use_expected_when_no_actual: e.target.checked }))
                }
              />
              <label className="form-check-label" htmlFor="useExpectedCheckbox">
                Use expected income when no actual income imported
              </label>
            </div>

            {selectedIncomeSettings && (
              <div className="alert alert-info py-2 small">
                Current settings: £{Number(selectedIncomeSettings.expected_amount || 0).toFixed(2)} {selectedIncomeSettings.frequency}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowExpectedIncomeModal(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveExpectedIncome}
              disabled={!expectedIncomeForm.expected_amount || Number(expectedIncomeForm.expected_amount) <= 0}
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
