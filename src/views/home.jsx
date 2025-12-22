import { useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import warden from "../../public/warden.jpg";
import Navbar from "../components/navbar.jsx";
import CsvPdfUpload from "../components/csv-pdf-upload.jsx";
export default function Home() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();


  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState("");

  const formattedBalance = useMemo(() => {
    const sign = balance < 0 ? "-" : "";
    return `${sign}£${Math.abs(balance).toFixed(2)}`;
  }, [balance]);

  const handleAddTransaction = (type) => {
    if (!amount || isNaN(amount)) return;

    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return;

    const newTransaction = {
      id: Date.now(),
      type,
      amount: value,
      date: new Date().toLocaleDateString(),
    };

    setTransactions((prev) => [newTransaction, ...prev]);
    setBalance((prev) => (type === "income" ? prev + value : prev - value));
    setAmount("");
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      const lines = String(event.target?.result ?? "").split(/\r?\n/).filter(Boolean);

      const parsed = lines
        .map((line) => line.split(","))
        .filter((row) => row.length >= 2)
        .map(([type, amount, date]) => {
          const value = parseFloat(amount);
          if (isNaN(value)) return null;

          const normalizedType = String(type).trim().toLowerCase() === "income" ? "income" : "expense";

          return {
            id: Date.now() + Math.random(),
            type: normalizedType,
            amount: value,
            date: date ? String(date).trim() : new Date().toLocaleDateString(),
          };
        })
        .filter(Boolean);

      const newBalance = parsed.reduce((acc, t) => {
        return t.type === "income" ? acc + t.amount : acc - t.amount;
      }, 0);

      setTransactions((prev) => [...parsed, ...prev]);
      setBalance((prev) => prev + newBalance);

      e.target.value = ""; // allow re-uploading same file
    };

    reader.readAsText(file);
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
              <div className={`display-6 mb-0 ${balance < 0 ? "text-danger" : "text-success"}`}>
                {formattedBalance}
              </div>
            </div>
            <span className={`badge rounded-pill ${balance < 0 ? "text-bg-danger" : "text-bg-success"}`}>
              {balance < 0 ? "Over budget" : "Looking good"}
            </span>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* Add Transaction */}
        <div className="col-12 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h2 className="h5 mb-3">Add Transaction</h2>

              <div className="row g-2 align-items-end">
                <div className="col-12">
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

                <div className="col-6">
                  <button
                    className="btn btn-success w-100"
                    onClick={() => handleAddTransaction("income")}
                  >
                    + Income
                  </button>
                </div>

                <div className="col-6">
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
        </div>

        {/* CSV Upload */}
        <div className="col-12 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h2 className="h5 mb-2">Upload CSV</h2>

                    <CsvPdfUpload/>

            </div>
          </div>
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
                      className="list-group-item d-flex align-items-center justify-content-between"
                    >
                      <span className={t.type === "income" ? "text-success fw-semibold" : "text-danger fw-semibold"}>
                        {t.type === "income" ? "+ " : "− "}£{t.amount.toFixed(2)}
                      </span>
                      <span className="text-muted small">{t.date}</span>
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
