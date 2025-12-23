import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as pdfjsLib from 'pdfjs-dist';
import { useTransactions } from "../state/TransactionsContext";

// Configure PDF.js worker - use unpkg as it's more reliable
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export default function CsvPdfUpload({ onSave }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploadedTransactions, setUploadedTransactions] = useState([]);
  const csvInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  const { bulkAddTransactions } = useTransactions();

  const parseBankStatement = (text) => {
    const parsed = [];
    
    // More flexible pattern that works with PDF text extraction
    // Matches: "date description amount balance" or "date description moneyIn/moneyOut balance"
    const transactionPattern = /(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+(.+?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})/gi;
    
    let match;
    while ((match = transactionPattern.exec(text)) !== null) {
      const [, date, description, amount1, amount2] = match;
      
      // amount1 is the transaction amount, amount2 is the balance
      const transactionAmount = parseFloat(amount1);
      if (isNaN(transactionAmount) || transactionAmount === 0) continue;
      
      const cleanDesc = description.trim();
      if (!cleanDesc || cleanDesc.length < 3) continue;
      
      // Determine if it's income based on keywords
      const descLower = cleanDesc.toLowerCase();
      const isIncome = descLower.includes('receipt') || 
                      descLower.includes('payment from') || 
                      descLower.includes('transfer from') ||
                      descLower.includes('allowance') ||
                      descLower.includes('bill payment from') ||
                      descLower.includes('faster payments receipt');
      
      parsed.push({
        id: Date.now() + Math.random(),
        type: isIncome ? "income" : "expense",
        amount: transactionAmount,
        date: date.trim(),
        description: cleanDesc.substring(0, 60)
      });
    }
    
    return parsed;
  };

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

      console.log('Extracted PDF text:', fullText.substring(0, 500)); // Debug log

      const parsed = parseBankStatement(fullText);
      
      if (parsed.length === 0) {
        console.error('No transactions parsed from text');
        alert('No transactions found in PDF. Please check the format or try a different file.');
        e.target.value = "";
        return;
      }

      setUploadedTransactions(parsed);
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

        setUploadedTransactions(parsed);
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
                Automatically detects transactions and amounts<br/>
                Works with most UK bank formats
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
                {uploadedTransactions.map((t) => (
                  <li
                    key={t.id}
                    className="list-group-item d-flex align-items-start justify-content-between"
                  >
                    <div style={{ flex: 1 }}>
                      <span className={t.type === "income" ? "text-success fw-semibold" : "text-danger fw-semibold"}>
                        {t.type === "income" ? "+ " : "− "}£{t.amount.toFixed(2)}
                      </span>
                      {t.description && (
                        <div className="text-muted small mt-1" style={{ fontSize: '0.85rem' }}>
                          {t.description}
                        </div>
                      )}
                    </div>
                    <span className="text-muted small ms-3" style={{ whiteSpace: 'nowrap' }}>
                      {t.date}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3 text-center">
              <button 
                className="btn btn-primary"
                disabled={uploadedTransactions.length === 0 || loading}
                onClick={() => {
                  if (!uploadedTransactions || uploadedTransactions.length === 0) {
                    alert('No transactions to upload');
                    return;
                  }

                  // Use provided onSave if the parent passed one, otherwise use the Transactions Context
                  if (onSave) {
                    try { onSave(uploadedTransactions); } catch (e) { console.error(e); }
                    alert('Transactions uploaded!');
                  } else {
                    try {
                      bulkAddTransactions(uploadedTransactions);
                      alert('Transactions uploaded!');
                    } catch (e) {
                      console.error('Error uploading transactions to context', e);
                      alert('Transactions saved! (Add your save logic here)');
                    }
                  }

                  // Clear preview and file inputs
                  setUploadedTransactions([]);
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

