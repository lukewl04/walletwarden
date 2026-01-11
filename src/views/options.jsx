import React, { useState, useEffect } from "react";
import Navbar from "../components/navbar.jsx";
import { useTransactions } from "../state/TransactionsContext";
import { useAuth0 } from "@auth0/auth0-react";
import { TRANSACTION_CATEGORIES } from "../utils/categories";

const CURRENCY_OPTIONS = [
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
];

const CURRENCY_STORAGE_KEY = 'walletwarden:currency';
const CUSTOM_CATEGORIES_KEY = 'walletwarden:customCategories';
const PROFILE_PICTURE_KEY = 'walletwarden:profilePicture';

const API_URL = "http://localhost:4000/api";

export default function Options() {
  const { clearTransactions } = useTransactions();
  const { user, logout } = useAuth0();
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    return localStorage.getItem(CURRENCY_STORAGE_KEY) || 'GBP';
  });
  const [customCategories, setCustomCategories] = useState(() => {
    const stored = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    return stored ? JSON.parse(stored) : [];
  });
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [activeTab, setActiveTab] = useState("account");
  const [uploadedProfilePicture, setUploadedProfilePicture] = useState(() => {
    return localStorage.getItem(PROFILE_PICTURE_KEY) || null;
  });
  const [uploadMessage, setUploadMessage] = useState("");

  // Save currency to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, selectedCurrency);
  }, [selectedCurrency]);

  // Save custom categories to localStorage when they change
  useEffect(() => {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(customCategories));
  }, [customCategories]);

  const handleResetClick = () => {
    setShowConfirmModal(true);
  };

  const confirmReset = async () => {
    try {
      setIsResetting(true);
      setResetMessage("Resetting your data...");

      // Clear data on backend (Supabase) first
      const token = localStorage.getItem("walletwarden-token") || "dev-user";
      try {
        const response = await fetch(`${API_URL}/reset`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log("Backend reset result:", result);
        } else {
          console.error("Backend reset failed:", response.status);
        }
      } catch (err) {
        console.error("Error resetting data on backend:", err);
      }

      // Clear insights transactions via context/API
      await clearTransactions();

      // Clear all localStorage data related to the app
      localStorage.removeItem("walletwardenSplits");
      localStorage.removeItem("walletwardenSelectedSplit");
      localStorage.removeItem("walletwardenCategoryRules");
      localStorage.removeItem("walletwardenSplitIncomes");
      localStorage.removeItem("walletwarden:transactions:v1");

      setResetMessage("All data has been cleared from your account successfully!");
      setShowConfirmModal(false);
      setTimeout(() => {
        setResetMessage("");
        setIsResetting(false);
        // Reload the page to reset all state
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error("Error clearing data:", error);
      setResetMessage("Error clearing data. Please try again.");
      setIsResetting(false);
    }
  };

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    
    if (!trimmed) {
      setCategoryError("Category name cannot be empty");
      return;
    }

    const allCategories = [...TRANSACTION_CATEGORIES, ...customCategories];
    if (allCategories.some(cat => cat.toLowerCase() === trimmed.toLowerCase())) {
      setCategoryError("Category already exists");
      return;
    }

    setCustomCategories([...customCategories, trimmed]);
    setNewCategory("");
    setCategoryError("");
  };

  const handleRemoveCategory = (category) => {
    setCustomCategories(customCategories.filter(cat => cat !== category));
  };

  const handleProfilePictureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file is an image (excluding GIF)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setUploadMessage('Please select a JPG, PNG, WebP, or SVG file (GIFs not supported)');
      setTimeout(() => setUploadMessage(''), 3000);
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadMessage('Image must be smaller than 5MB');
      setTimeout(() => setUploadMessage(''), 3000);
      return;
    }

    // Read file as base64 and store in localStorage
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result;
      localStorage.setItem(PROFILE_PICTURE_KEY, base64String);
      setUploadedProfilePicture(base64String);
      setUploadMessage('Profile picture updated successfully!');
      setTimeout(() => setUploadMessage(''), 3000);
    };
    reader.onerror = () => {
      setUploadMessage('Error reading file');
      setTimeout(() => setUploadMessage(''), 3000);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProfilePicture = () => {
    localStorage.removeItem(PROFILE_PICTURE_KEY);
    setUploadedProfilePicture(null);
    setUploadMessage('Profile picture removed');
    setTimeout(() => setUploadMessage(''), 3000);
  };

  const currencyInfo = CURRENCY_OPTIONS.find(c => c.code === selectedCurrency);

  return (
    <div className="container py-4 mt-5" style={{ maxWidth: 700, minHeight: "100vh" }}>
      <Navbar />

      <div className="mb-4">
        <h1 className="h3 mb-1">Settings</h1>
        <p className="text-muted">Manage your preferences and account</p>
      </div>

      {resetMessage && (
        <div className={`alert alert-${resetMessage.includes("Error") ? "danger" : "success"} alert-dismissible fade show`} role="alert">
          {resetMessage}
          <button
            type="button"
            className="btn-close"
            onClick={() => setResetMessage("")}
          />
        </div>
      )}

      {/* Tab Navigation */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            👤 Account
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "currency" ? "active" : ""}`}
            onClick={() => setActiveTab("currency")}
          >
            💱 Currency
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "categories" ? "active" : ""}`}
            onClick={() => setActiveTab("categories")}
          >
            🏷️ Categories
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "data" ? "active" : ""}`}
            onClick={() => setActiveTab("data")}
          >
            📊 Data
          </button>
        </li>
      </ul>

      {/* Account Settings Tab */}
      {activeTab === "account" && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title mb-4">Account Settings</h5>
            
            {user && (
              <div className="mb-4">
                <div className="mb-3">
                  <label className="form-label small text-muted">Email</label>
                  <p className="mb-0">{user.email}</p>
                </div>
                
                {user.name && (
                  <div className="mb-3">
                    <label className="form-label small text-muted">Name</label>
                    <p className="mb-0">{user.name}</p>
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label small text-muted d-block mb-2">Profile Picture</label>
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <img 
                      src={uploadedProfilePicture || user.picture} 
                      alt="Profile" 
                      style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div className="d-flex flex-column gap-2">
                      <div className="d-flex gap-2">
                        <label className="btn btn-primary">
                          📤 Upload
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleProfilePictureUpload}
                            style={{ display: 'none' }}
                          />
                        </label>
                        {uploadedProfilePicture && (
                          <button
                            className="btn btn-secondary"
                            onClick={handleRemoveProfilePicture}
                          >
                            🗑️ Remove
                          </button>
                        )}
                      </div>
                      {uploadMessage && (
                        <small className={`text-${uploadMessage.includes('Error') || uploadMessage.includes('must') ? 'danger' : 'success'}`}>
                          {uploadMessage}
                        </small>
                      )}
                    </div>
                  </div>
                  <small className="text-muted d-block">
                    Max file size: 5MB. Supports JPG, PNG, WebP, SVG.
                  </small>
                </div>
              </div>
            )}

            <hr className="my-4" />

            <div>
              <h6 className="mb-3">Sign Out</h6>
              <button
                className="btn btn-secondary"
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              >
                🚪 Sign Out
              </button>
              <p className="text-muted small mt-3 mb-0">
                You will be signed out from your account.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Currency Settings Tab */}
      {activeTab === "currency" && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title mb-4">Currency Preference</h5>
            
            <div className="mb-3">
              <label className="form-label">Select Currency</label>
              <select
                className="form-select"
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
              >
                {CURRENCY_OPTIONS.map(currency => (
                  <option key={currency.code} value={currency.code}>
                    {currency.symbol} {currency.code} - {currency.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="alert alert-info">
              <strong>Current Selection:</strong> {currencyInfo?.symbol} {currencyInfo?.code} ({currencyInfo?.name})
              <br />
              <small className="mt-2 d-block">This setting will be used for all future transactions. Previously entered amounts will remain unchanged.</small>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Tab */}
      {activeTab === "categories" && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title mb-4">Manage Categories</h5>

            <div className="mb-4">
              <label className="form-label">Add Custom Category</label>
              <div className="input-group">
                <input
                  type="text"
                  className={`form-control ${categoryError ? "is-invalid" : ""}`}
                  placeholder="e.g., Home Improvement"
                  value={newCategory}
                  onChange={(e) => {
                    setNewCategory(e.target.value);
                    setCategoryError("");
                  }}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") handleAddCategory();
                  }}
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleAddCategory}
                >
                  Add
                </button>
              </div>
              {categoryError && (
                <div className="invalid-feedback d-block">{categoryError}</div>
              )}
            </div>

            <div>
              <h6 className="mb-3">Default Categories</h6>
              <div className="mb-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {TRANSACTION_CATEGORIES.map(cat => (
                  <span key={cat} className="badge bg-secondary me-2 mb-2">
                    {cat}
                  </span>
                ))}
              </div>
            </div>

            {customCategories.length > 0 && (
              <div>
                <h6 className="mb-3">Custom Categories</h6>
                <div className="mb-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {customCategories.map(cat => (
                    <div key={cat} className="d-flex align-items-center gap-2 mb-2">
                      <span className="badge bg-info">{cat}</span>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleRemoveCategory(cat)}
                        title="Remove category"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Management Tab */}
      {activeTab === "data" && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title mb-4">Data Management</h5>
            <p className="text-muted mb-4">
              Use these options to manage your transaction data.
            </p>

            <div className="d-grid gap-2">
              <button
                className="btn btn-secondary"
                onClick={handleResetClick}
                disabled={isResetting}
                style={{ opacity: isResetting ? 0.6 : 1, cursor: isResetting ? 'not-allowed' : 'pointer' }}
              >
                {isResetting ? "⏳ Clearing..." : "🗑️ Clear All Transactions"}
              </button>
            </div>
            <p className="text-muted small mt-3 mb-0">
              This will permanently delete all your transactions from both local storage and the server. This action cannot be undone.
            </p>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="modal d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          role="dialog"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-danger">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">⚠️ Confirm Reset</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowConfirmModal(false)}
                />
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  Are you sure you want to delete <strong>all transactions</strong>? This action is permanent and cannot be undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isResetting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmReset}
                  disabled={isResetting}
                  style={{ opacity: isResetting ? 0.6 : 1, cursor: isResetting ? 'not-allowed' : 'pointer' }}
                >
                  {isResetting ? "Deleting..." : "Delete All"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
