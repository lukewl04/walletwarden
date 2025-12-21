import { useState } from 'react';

export default function Home() {
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [amount, setAmount] = useState('');

    const handleAddTransaction = (type) => {
        if (!amount || isNaN(amount)) return;

        const value = parseFloat(amount);

        const newTransaction = {
            id: Date.now(),
            type,
            amount: value,
            date: new Date().toLocaleDateString(),
        };

        setTransactions(prev => [newTransaction, ...prev]);
        setBalance(prev => (type === 'income' ? prev + value : prev - value));
        setAmount('');
    };

    const handleCSVUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = (event) => {
            const lines = event.target.result.split('\n');

            const parsed = lines
                .map(line => line.split(','))
                .filter(row => row.length >= 2)
                .map(([type, amount, date]) => {
                    const value = parseFloat(amount);
                    if (isNaN(value)) return null;

                    return {
                        id: Date.now() + Math.random(),
                        type: type.trim().toLowerCase(),
                        amount: value,
                        date: date ? date.trim() : new Date().toLocaleDateString(),
                    };
                })
                .filter(Boolean);

            const newBalance = parsed.reduce((acc, t) => {
                return t.type === 'income' ? acc + t.amount : acc - t.amount;
            }, 0);

            setTransactions(prev => [...parsed, ...prev]);
            setBalance(prev => prev + newBalance);
        };

        reader.readAsText(file);
    };

    return (
        <div className="home-container">
            <header className="header">
                <h1>Wallet Warden</h1>
                <p className="subtitle">Track your money before it mysteriously disappears</p>
            </header>

            <section className="balance-card">
                <h2>Current Balance</h2>
                <p className={`balance-amount ${balance < 0 ? 'negative' : ''}`}>
                    £{balance.toFixed(2)}
                </p>
            </section>

            <section className="card">
                <h3>Add Transaction</h3>
                <div className="transaction-input">
                    <input
                        type="number"
                        placeholder="Amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        step="0.01"
                    />
                    <button className="income" onClick={() => handleAddTransaction('income')}>
                        Income
                    </button>
                    <button className="expense" onClick={() => handleAddTransaction('expense')}>
                        Expense
                    </button>
                </div>
            </section>

            <section className="card">
                <h3>Upload CSV</h3>
                <p className="hint">Format: type, amount, date (optional)</p>
                <input type="file" accept=".csv" onChange={handleCSVUpload} />
            </section>

            <section className="card">
                <h3>Recent Transactions</h3>
                {transactions.length === 0 ? (
                    <p className="empty">No transactions yet</p>
                ) : (
                    <ul className="transactions-list">
                        {transactions.map(t => (
                            <li key={t.id} className={`transaction ${t.type}`}>
                                <span>
                                    {t.type === 'income' ? '+' : '-'}£{t.amount.toFixed(2)}
                                </span>
                                <span className="date">{t.date}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
