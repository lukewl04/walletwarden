import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as pdfjsLib from 'pdfjs-dist';
import { useTransactions } from "../state/TransactionsContext";

// Configure PDF.js worker - use local ES module served from public/
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
// NOTE: The pdf.worker.min.mjs file is a Web Worker that runs in a separate
// thread to handle heavy PDF parsing without blocking the main UI thread.

export default function CsvPdfUpload({ onSave }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploadedTransactions, setUploadedTransactions] = useState([]);
  const csvInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  const { bulkAddTransactions, clearTransactions } = useTransactions();

  const parseBankStatement = (text) => {
    const parsed = [];

    // Split text into lines
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Date pattern: e.g., "20th Nov", "1st Dec", "19th Dec"
    const datePattern = /^(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?)/i;

    // Skip lines that are clearly headers, summaries, or balance info
    const skipKeywords = [
      'balance brought forward',
      'balance carried forward',
      'average balance',
      'total money',
      'sort code',
      'account number',
      'statement number',
      'statement of',
      'interest',
      'charges',
      'average',
      'your transactions',
      'date',
      'description',
      'money in',
      'money out',
      'page number'
    ];

    // First pass: find all lines with dates and their indices
    const dateLines = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(datePattern);
      if (match) {
        dateLines.push({ index: i, date: match[1] });
      }
    }

    // Second pass: for each date, extract transaction info from following lines
    for (let d = 0; d < dateLines.length; d++) {
      const currentDateInfo = dateLines[d];
      const nextDateIndex = d + 1 < dateLines.length ? dateLines[d + 1].index : lines.length;
      const dateStr = currentDateInfo.date;

      // Collect all lines between this date and the next date
      const transactionLines = lines.slice(currentDateInfo.index, nextDateIndex);
      const transactionText = transactionLines.join(' ');

      // Skip if line contains skip keywords
      if (skipKeywords.some(kw => transactionText.toLowerCase().includes(kw))) continue;

      // Extract all amounts (numbers with .2 decimal places)
      const amountMatches = transactionText.match(/(\d+[.,]\d{2})/g);
      if (!amountMatches || amountMatches.length < 2) continue;

      const amounts = amountMatches.map(a => parseFloat(a.replace(',', '')));

      // For Santander: typically [money_in OR money_out, balance]
      // One will be the transaction, one will be the balance
      // Usually the larger or different one is the balance
      let transactionAmount = null;
      let isIncome = false;

      if (amounts.length === 2) {
        // [transaction, balance]
        transactionAmount = amounts[0];
      } else if (amounts.length >= 3) {
        // [money_in, money_out, balance] or [money_in, balance] where one is 0
        // Santander shows both columns even if one is empty
        const first = amounts[0];
        const second = amounts[1];
        
        // If second is much larger (balance), first is the transaction
        if (Math.abs(second) > Math.abs(first) * 2) {
          transactionAmount = first;
        } else {
          // Otherwise use the one that's not zero or is smaller
          transactionAmount = first > 0 ? first : second;
        }
      }

      if (!transactionAmount || transactionAmount === 0) continue;

      // Extract description (everything between date and first amount)
      let description = transactionText.replace(dateStr, '').trim();
      // Remove all amounts
      description = description.replace(/\d+[.,]\d{2}/g, '').trim();
      description = description.replace(/\s{2,}/g, ' ').trim();

      if (!description || description.length < 2) continue;

      // Determine income vs expense based on keywords
      isIncome = description.toLowerCase().includes('receipt') || 
                description.toLowerCase().includes('transfer from') ||
                description.toLowerCase().includes('payment received');

      parsed.push({
        id: Date.now() + Math.random(),
        type: isIncome ? 'income' : 'expense',
        amount: Math.abs(transactionAmount),
        date: dateStr.trim(),
        description: description.substring(0, 80)
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

      console.log('=== EXTRACTED PDF TEXT ===');
      console.log(fullText);
      console.log('=== END PDF TEXT ===');

      const parsed = parseBankStatement(fullText);
      
      if (parsed.length === 0) {
        console.error('No transactions parsed from text');
        console.log('Full extracted text:', fullText);
        alert('No transactions found in PDF. Please check the format or try a different file.\n\nCheck the browser console (F12) for the extracted text to see what format your PDF has.');
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

            <div className="mt-3 d-flex gap-2 justify-content-center">
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

      {/* Reset Button - Always Visible */}
      <div className="mt-4 text-center">
        <button 
          className="btn btn-danger"
          disabled={loading}
          onClick={async () => {
            // Clear everything
            setUploadedTransactions([]);
            try {
              await clearTransactions();
            } catch (e) {
              console.error('Error clearing transactions:', e);
            }
            try { if (csvInputRef.current) csvInputRef.current.value = ''; } catch (_) {}
            try { if (pdfInputRef.current) pdfInputRef.current.value = ''; } catch (_) {}
            alert('All transactions cleared!');
          }}
        >
          Reset All Transactions
        </button>
      </div>
    </div>
  );
}

