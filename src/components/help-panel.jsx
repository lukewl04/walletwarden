import { useState } from "react";
import "./help-panel.css";

export default function HelpPanel() {
  const [showHelp, setShowHelp] = useState(true);

  const handleClose = () => {
    setShowHelp(false);
    localStorage.removeItem("walletwarden-show-help");
  };

  if (!showHelp) return null;

  return (
    <div className="help-panel">
      <div className="help-panel-header">
        <h3 className="help-panel-title">📚 Getting Started</h3>
        <button 
          className="help-panel-close"
          onClick={handleClose}
          aria-label="Close help"
        >
          ✕
        </button>
      </div>

      <div className="help-panel-content">
        <div className="help-item">
          <h4 className="help-item-title">💬 Quick Add</h4>
          <p className="help-item-description">
            Quickly add individual transactions with a category and description. Perfect for expenses or income you want to record on the go.
          </p>
        </div>

        <div className="help-item">
          <h4 className="help-item-title">📄 Import CSV/PDF Statement</h4>
          <p className="help-item-description">
            Upload your bank statements in CSV or PDF format to bulk import transactions into your account.
          </p>
        </div>

        <div className="help-item">
          <h4 className="help-item-title">🏦 Connect Bank (Open Banking)</h4>
          <p className="help-item-description">
            Securely connect your bank account using Open Banking. Once connected, you can sync real-time transactions with a single click.
          </p>
        </div>

        <div className="help-item">
          <h4 className="help-item-title">📊 Charts & Insights</h4>
          <p className="help-item-description">
            View your spending patterns with visual charts. See your top expense categories, net balance over time, and income vs expense breakdown.
          </p>
        </div>

        <div className="help-item">
          <h4 className="help-item-title">📋 Recent Transactions</h4>
          <p className="help-item-description">
            Browse all your transactions. Click on any category to edit it and organize your spending better.
          </p>
        </div>
      </div>
    </div>
  );
}
