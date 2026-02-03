import React from "react";
import CsvPdfUpload from "../csv-pdf-upload.jsx";

export default function ImportModal({
  showImportModal,
  setShowImportModal,
  handleBulkAdd,
}) {
  if (!showImportModal) return null;

  return (
    <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} role="dialog">
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '420px' }}>
        <div className="modal-content">
          <div className="modal-header py-1 px-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>Import Statement</span>
            <button type="button" className="btn-close" style={{ fontSize: '0.6rem' }} onClick={() => setShowImportModal(false)} />
          </div>
          <div className="modal-body p-3">
            <CsvPdfUpload bulkAddTransactions={handleBulkAdd} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
