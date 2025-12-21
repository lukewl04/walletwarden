import { useState } from 'react';



export default function Home() {
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [amount, setAmount] = useState('');

    const handleAddTransaction = (type) => {
        if (!amount || isNaN(amount)) return;

        const newTransaction = {
            id: Date.now(),
            type,
            amount: parseFloat(amount),
            date: new Date().toLocaleDateString(),
        };

        setTransactions([newTransaction, ...transactions]);
        setBalance(
            type === 'income'
                ? balance + parseFloat(amount)
                : balance - parseFloat(amount)
        );
        setAmount('');
    };

    return (
        <div className="home-container">
            <h1>Wallet Warden</h1>

            <div className="balance-card">
                <h2>Current Balance</h2>
                <p className="balance-amount">${balance.toFixed(2)}</p>
            </div>

            <div className="transaction-input">
                <input
                    type="number"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    step="0.01"
                />
                <button onClick={() => handleAddTransaction('income')}>
                    Add Income
                </button>
                <button onClick={() => handleAddTransaction('expense')}>
                    Add Expense
                </button>
            </div>

            <div className="transactions-list">
                <h2>Recent Transactions</h2>
                {transactions.length === 0 ? (
                    <p>No transactions yet</p>
                ) : (
                    transactions.map((t) => (
                        <div key={t.id} className={`transaction ${t.type}`}>
                            <span>{t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}</span>
                            <span>{t.date}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}