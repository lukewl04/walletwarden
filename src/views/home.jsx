import { useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Navbar from "../components/navbar.jsx";
import CsvPdfUpload from "../components/csv-pdf-upload.jsx";
import WardenInsights from "../components/wardenInsights.jsx";
import { useTransactions } from "../state/TransactionsContext";
export default function Home() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();


  const { transactions, addTransaction, bulkAddTransactions, totals } = useTransactions();
  const [amount, setAmount] = useState("");
  const categories = ["Food","Petrol","Subscriptions","Transport","Bills","Shopping","Savings","Entertainment","Other"];
  const [category, setCategory] = useState("Other");

  const formattedBalance = useMemo(() => {
    const b = totals?.balance ?? 0;
    const sign = b < 0 ? "-" : "";
    return `${sign}£${Math.abs(b).toFixed(2)}`;
  }, [totals]);

  const handleAddTransaction = (type) => {
    if (!amount || isNaN(amount)) return;

    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return;

    const normalizedType = (type || "expense").toLowerCase() === "income" ? "income" : "expense";

    const newTransaction = {
      id: Date.now(),
      type: normalizedType,
      amount: value,
      date: new Date().toISOString(), // store as ISO for consistency
      category: category || 'Other',
      description: "",
    };

    addTransaction(newTransaction);
    setAmount("");
    setCategory("Other");
  };

  // While Auth0 is loading or redirecting
  if (isLoading || !isAuthenticated) {
    return (
      <div className="container py-5" style={{ maxWidth: 900 }}>
        <div className="card shadow-sm">
          <div className="card-body p-4">
            <h1 className="h3 mb-2">Wallet Warden</h1>
            <p className="text-muted mb-0">Signing you in…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      {/* Header */}
      <Navbar />
        <header className="text-center mb-4">

        <h1 className="h3 mb-1">Wallet Warden</h1>
        <p className="text-muted">
            Track your money before it mysteriously disappears
        </p>
        </header>


      {/* Balance */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between gap-3">
            <div>
              <div className="text-muted small">Current Balance</div>
              <div className={`display-6 mb-0 ${(totals?.balance ?? 0) < 0 ? "text-danger" : "text-success"}`}>
                {formattedBalance}
              </div>
            </div>
            <span className={`badge rounded-pill ${(totals?.balance ?? 0) < 0 ? "text-bg-danger" : "text-bg-success"}`}>
              {(totals?.balance ?? 0) < 0 ? "Over budget" : "Looking good"}
            </span>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* Add Transaction */}
        <div className="col-12 col-md-4 col-lg-4">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h2 className="h6 mb-3">Quick Add</h2>

              <div className="mb-2">
                <label className="form-label">Amount</label>
                <input
                  className="form-control"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.01"
                  min="0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTransaction("income");
                  }}
                />
                <div className="form-text">Enter a number (e.g. 12.50)</div>
              </div>

              <div className="mb-2">
                <label className="form-label">Category</label>
                <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="d-flex gap-2 mt-3">
                <button
                  className="btn btn-success w-100"
                  onClick={() => handleAddTransaction("income")}
                >
                  + Income
                </button>

                <button
                  className="btn btn-danger w-100"
                  onClick={() => handleAddTransaction("expense")}
                >
                  − Expense
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CSV Upload */}
        <div className="col-12 col-md-8 col-lg-8">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h2 className="h5 mb-2">Upload CSV</h2>

                    <CsvPdfUpload />

            </div>
          </div>
        </div>

        {/* Warden Insights */}
        <div className="col-12">
          <WardenInsights transactions={transactions} />
        </div>

        {/* Recent Transactions */}
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h2 className="h5 mb-0">Recent Transactions</h2>
                <span className="text-muted small">
                  {transactions.length} total
                </span>
              </div>

              {transactions.length === 0 ? (
                <div className="text-muted">No transactions yet</div>
              ) : (
                <ul className="list-group">
                  {transactions.map((t) => (
                    <li
                      key={t.id}
                      className="list-group-item d-flex align-items-start justify-content-between"
                    >
                      <div style={{ flex: 1 }}>
                        <div className="d-flex align-items-center gap-2">
                          <span className={t.type === "income" ? "text-success fw-semibold" : "text-danger fw-semibold"}>
                            {t.type === "income" ? "+ " : "− "}£{t.amount.toFixed(2)}
                          </span>
                          <span className="badge bg-secondary" style={{ fontSize: '0.75rem' }}>{t.category || 'Other'}</span>
                        </div>

                        {t.description && (
                          <div className="text-muted small mt-1" style={{ fontSize: '0.85rem' }}>
                            {t.description}
                          </div>
                        )}
                      </div>
                      <span className="text-muted small ms-3" style={{ whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
