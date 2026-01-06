import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as pdfjsLib from 'pdfjs-dist';
import { useTransactions } from "../state/TransactionsContext";
import { parsePDFText } from "../utils/bankParsers";
import { TRANSACTION_CATEGORIES, suggestCategory } from "../utils/categories";

// Configure PDF.js worker - use local ES module served from public/
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
// NOTE: The pdf.worker.min.mjs file is a Web Worker that runs in a separate
// thread to handle heavy PDF parsing without blocking the main UI thread.

export default function CsvPdfUpload({ onSave }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploadedTransactions, setUploadedTransactions] = useState([]);
  const [categoryEdits, setCategoryEdits] = useState({}); // Track category changes
  const csvInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  const { bulkAddTransactions, clearTransactions } = useTransactions();

  const handlePDFUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        // Join with newlines to preserve some structure
        const pageText = textContent.items.map(item => item.str).join('\n');
        fullText += pageText + '\n';
      }

      console.log('=== EXTRACTED PDF TEXT ===');
      console.log(fullText);
      console.log('=== END PDF TEXT ===');

      // Use the flexible parser system
      const parsed = parsePDFText(fullText);
      
      if (parsed.length === 0) {
        console.error('No transactions parsed from text');
        console.log('Full extracted text:', fullText);
        alert('No transactions found in PDF. The system tried multiple format parsers but couldn\'t detect your bank statement format.\n\nPlease check the browser console (F12) for the extracted text and consider:\n1. Using the CSV upload instead\n2. Manually entering transactions\n3. Checking if your PDF is a valid bank statement');
        e.target.value = "";
        return;
      }

      // Add auto-suggested categories to each transaction
      const transactionsWithCategories = parsed.map(t => ({
        ...t,
        category: suggestCategory(t.description)
      }));

      setUploadedTransactions(transactionsWithCategories);
      setCategoryEdits({}); // Reset category edits
      e.target.value = "";
    } catch (error) {
      console.error('Error reading PDF:', error);
      alert(`Error reading PDF file: ${error.message}. Please try again or check the file format.`);
    } finally {
      setLoading(false);
    }
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = String(event.target?.result ?? "");
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        
        if (lines.length === 0) return;

        // Check if it's a Monzo-style CSV (with headers)
        const firstLine = lines[0].toLowerCase();
        const isMonzoFormat = firstLine.includes('transaction id') || 
                             firstLine.includes('money out') || 
                             firstLine.includes('money in');

        let parsed = [];

        if (isMonzoFormat) {
          // Parse Monzo CSV format
          const headers = lines[0].split(',');
          const dateIndex = headers.findIndex(h => h.toLowerCase().includes('date'));
          const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name'));
          const moneyOutIndex = headers.findIndex(h => h.toLowerCase().includes('money out'));
          const moneyInIndex = headers.findIndex(h => h.toLowerCase().includes('money in'));
          const categoryIndex = headers.findIndex(h => h.toLowerCase().includes('category'));

          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',');
            if (row.length < headers.length - 5) continue; // Skip incomplete rows

            const moneyOut = parseFloat(row[moneyOutIndex]) || 0;
            const moneyIn = parseFloat(row[moneyInIndex]) || 0;
            
            // Skip if both are 0
            if (moneyOut === 0 && moneyIn === 0) continue;

            const isIncome = moneyIn > 0;
            const amount = isIncome ? moneyIn : Math.abs(moneyOut);
            
            parsed.push({
              id: Date.now() + Math.random(),
              type: isIncome ? "income" : "expense",
              amount: amount,
              date: row[dateIndex] || new Date().toLocaleDateString('en-GB'),
              description: (row[nameIndex] || 'Transaction').substring(0, 60)
            });
          }
        } else {
          // Parse simple CSV format (type, amount, date)
          parsed = lines
            .map((line) => line.split(","))
            .filter((row) => row.length >= 2)
            .map(([type, amount, date]) => {
              const value = parseFloat(amount);
              if (isNaN(value)) return null;

              const normalizedType = String(type).trim().toLowerCase() === "income" ? "income" : "expense";

              return {
                id: Date.now() + Math.random(),
                type: normalizedType,
                amount: Math.abs(value),
                date: date ? String(date).trim() : new Date().toLocaleDateString('en-GB'),
              };
            })
            .filter(Boolean);
        }

        if (parsed.length === 0) {
          alert('No transactions found in CSV. Please check the format.');
          e.target.value = "";
          return;
        }

        // Add auto-suggested categories to each transaction
        const transactionsWithCategories = parsed.map(t => ({
          ...t,
          category: suggestCategory(t.description)
        }));

        setUploadedTransactions(transactionsWithCategories);
        setCategoryEdits({}); // Reset category edits
        alert(`Successfully imported ${parsed.length} transactions!`);
      } catch (err) {
        console.error('Error parsing CSV:', err);
        alert(`Error parsing CSV file: ${err.message}`);
      } finally {
        // allow re-uploading same file and ensure input is cleared
        try { e.target.value = ""; } catch (_) {}
      }
    };

    reader.readAsText(file);
  };

  const calculateBalance = () => {
    return uploadedTransactions.reduce((acc, t) => {
      return t.type === "income" ? acc + t.amount : acc - t.amount;
    }, 0);
  };

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      {/* Header with Back Button */}
      <div className="d-flex align-items-center mb-4">
        <div>
          <h1 className="h3 mb-1">Import Statements</h1>
          <p className="text-muted mb-0">Upload your bank statements in CSV or PDF format</p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h2 className="h5 mb-3">📄 CSV Upload</h2>
              <p className="text-muted small mb-3">
                <strong>Supports two formats:</strong><br/>
                <strong>1. Simple:</strong> <code>type, amount, date</code><br/>
                <strong>2. Bank export:</strong> Monzo, Starling, etc. (with headers)
              </p>
              <input 
                ref={csvInputRef}
                className="form-control" 
                type="file" 
                accept=".csv" 
                onChange={handleCSVUpload} 
                disabled={loading}
              />
              <div className="mt-3 p-2 bg-light rounded">
                <small className="text-muted">
                  <strong>Simple format example:</strong><br/>
                  income, 1000.00, 1st Jan<br/>
                  expense, 25.50, 2nd Jan
                </small>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h2 className="h5 mb-3">📑 PDF Upload</h2>
              <p className="text-muted small mb-3">
                <strong>Bank statement PDF</strong><br/>
                Smart format detection - supports:<br/>
                Santander, Monzo, tables, and more<br/>
                Automatically extracts transactions
              </p>
              <input 
                ref={pdfInputRef}
                className="form-control" 
                type="file" 
                accept=".pdf" 
                onChange={handlePDFUpload}
                disabled={loading}
              />
              
              {loading && (
                <div className="text-center mt-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <div className="small text-muted mt-2">Processing PDF...</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      {uploadedTransactions.length > 0 && (
        <div className="card shadow-sm">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h2 className="h5 mb-0">Preview: {uploadedTransactions.length} Transactions</h2>
              <div className="text-end">
                <div className="text-muted small">Net Impact</div>
                <div className={`h5 mb-0 ${calculateBalance() < 0 ? "text-danger" : "text-success"}`}>
                  {calculateBalance() < 0 ? "-" : "+"}£{Math.abs(calculateBalance()).toFixed(2)}
                </div>
              </div>
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <ul className="list-group">
                {uploadedTransactions.map((t) => {
                  const currentCategory = categoryEdits[t.id] || t.category || 'Other';
                  return (
                    <li
                      key={t.id}
                      className="list-group-item"
                    >
                      <div className="d-flex align-items-start justify-content-between gap-2">
                        <div style={{ flex: 1 }}>
                          <div className="d-flex align-items-center gap-2 mb-2">
                            <span className={t.type === "income" ? "text-success fw-semibold" : "text-danger fw-semibold"}>
                              {t.type === "income" ? "+ " : "− "}£{t.amount.toFixed(2)}
                            </span>
                            <select
                              className="form-select form-select-sm"
                              style={{ width: '150px', fontSize: '0.85rem' }}
                              value={currentCategory}
                              onChange={(e) => {
                                setCategoryEdits({
                                  ...categoryEdits,
                                  [t.id]: e.target.value
                                });
                              }}
                            >
                              {TRANSACTION_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
                          {t.description && (
                            <div className="text-muted small" style={{ fontSize: '0.85rem' }}>
                              {t.description}
                            </div>
                          )}
                        </div>
                        <span className="text-muted small" style={{ whiteSpace: 'nowrap' }}>
                          {t.date}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-3 d-flex gap-2 justify-content-center">
              <button 
                className="btn btn-primary"
                disabled={uploadedTransactions.length === 0 || loading}
                onClick={() => {
                  if (!uploadedTransactions || uploadedTransactions.length === 0) {
                    alert('No transactions to upload');
                    return;
                  }

                  // Apply category edits to transactions before saving
                  const transactionsWithUpdatedCategories = uploadedTransactions.map(t => ({
                    ...t,
                    category: categoryEdits[t.id] || t.category || 'Other'
                  }));

                  // Use provided onSave if the parent passed one, otherwise use the Transactions Context
                  if (onSave) {
                    try { onSave(transactionsWithUpdatedCategories); } catch (e) { console.error(e); }
                    alert('Transactions uploaded!');
                  } else {
                    try {
                      bulkAddTransactions(transactionsWithUpdatedCategories);
                      alert('Transactions uploaded!');
                    } catch (e) {
                      console.error('Error uploading transactions to context', e);
                      alert('Transactions saved! (Add your save logic here)');
                    }
                  }

                  // Clear preview and file inputs
                  setUploadedTransactions([]);
                  setCategoryEdits({});
                  try { if (csvInputRef.current) csvInputRef.current.value = ''; } catch (_) {}
                  try { if (pdfInputRef.current) pdfInputRef.current.value = ''; } catch (_) {}
                }}
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

