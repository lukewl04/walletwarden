import React from "react";
import CsvPdfUpload from "../csv-pdf-upload.jsx";

export default function ImportModal({
  showImportModal,
  setShowImportModal,
  handleBulkAdd,
}) {
  if (!showImportModal) return null;

  return (
    <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} role="dialog">
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Import Bank Statement</h5>
            <button type="button" className="btn-close" onClick={() => setShowImportModal(false)} />
          </div>
          <div className="modal-body">
            <p className="text-body-secondary mb-3">
              Upload your bank statement in CSV or PDF format. Transactions will be automatically categorized based on your split's categories.
            </p>
            <CsvPdfUpload bulkAddTransactions={handleBulkAdd} />
          </div>
        </div>
      </div>
    </div>
  );
}
