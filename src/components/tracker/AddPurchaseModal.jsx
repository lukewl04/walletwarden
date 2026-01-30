import React from "react";

export default function AddPurchaseModal({
  showAddModal,
  setShowAddModal,
  newPurchase,
  setNewPurchase,
  selectedSplitData,
  handleAddPurchase,
}) {
  if (!showAddModal) return null;

  return (
    <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} role="dialog">
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Add Purchase</h5>
            <button type="button" className="btn-close" onClick={() => setShowAddModal(false)} />
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <label className="form-label small">Date</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={newPurchase.date}
                onChange={(e) => setNewPurchase({ ...newPurchase, date: e.target.value })}
              />
            </div>
            <div className="mb-3">
              <label className="form-label small">Amount (£)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control form-control-sm"
                value={newPurchase.amount}
                onChange={(e) => setNewPurchase({ ...newPurchase, amount: e.target.value })}
              />
            </div>
            <div className="mb-3">
              <label className="form-label small">Category</label>
              <select
                className="form-select form-select-sm"
                value={newPurchase.category}
                onChange={(e) => setNewPurchase({ ...newPurchase, category: e.target.value })}
              >
                <option value="">Select category…</option>
                {selectedSplitData?.categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label small">Description (optional)</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={newPurchase.description}
                onChange={(e) => setNewPurchase({ ...newPurchase, description: e.target.value })}
                placeholder="e.g. Tesco shopping"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleAddPurchase}>
              Add Purchase
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
