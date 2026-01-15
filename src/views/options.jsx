import React, { useState, useEffect } from "react";
import Navbar from "../components/navbar.jsx";
import { useTransactions } from "../state/TransactionsContext";
import { useAuth0 } from "@auth0/auth0-react";
import { TRANSACTION_CATEGORIES } from "../utils/categories";
import { getUserToken, clearAuth0User } from "../utils/userToken";

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

// Helper to get auth headers with unique user token
const getAuthHeaders = () => ({ Authorization: `Bearer ${getUserToken()}` });

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

  // Bank connection state
  const [bankStatus, setBankStatus] = useState(null);
  const [bankStatusLoading, setBankStatusLoading] = useState(true); // Loading state for initial status check
  const [bankLoading, setBankLoading] = useState(false);
  const [bankMessage, setBankMessage] = useState("");

  // Expected income state
  const [savedSplits, setSavedSplits] = useState([]);
  const [selectedSplitForIncome, setSelectedSplitForIncome] = useState(null);
  const [incomeSettings, setIncomeSettings] = useState([]);
  const [expectedIncomeForm, setExpectedIncomeForm] = useState({
    expected_amount: "",
    next_payday: "",
    frequency: "monthly",
    use_expected_when_no_actual: true,
  });
  const [incomeSaveMessage, setIncomeSaveMessage] = useState("");
  const [isLoadingIncome, setIsLoadingIncome] = useState(false);

  // Save currency to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, selectedCurrency);
  }, [selectedCurrency]);

  // Load bank connection status on mount
  useEffect(() => {
    // Reset loading state on mount (in case user navigated back)
    setBankLoading(false);
    setBankStatusLoading(true);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const checkBankStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/banks/truelayer/status`, {
          headers: { ...getAuthHeaders() },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          setBankStatus(data);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name !== 'AbortError') {
          console.error("Failed to check bank status:", err);
        }
      } finally {
        setBankStatusLoading(false);
      }
    };
    checkBankStatus();
    
    // Cleanup on unmount
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  // Save custom categories to localStorage when they change
  useEffect(() => {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(customCategories));
  }, [customCategories]);

  // Load splits and income settings when Income tab is active
  useEffect(() => {
    if (activeTab === "income") {
      loadSplitsAndIncomeSettings();
    }
  }, [activeTab]);

  // Update form when selected split changes
  useEffect(() => {
    if (selectedSplitForIncome && incomeSettings.length > 0) {
      const settings = incomeSettings.find(s => s.split_id === selectedSplitForIncome);
      const splitData = savedSplits.find(s => s.id === selectedSplitForIncome);
      if (settings) {
        setExpectedIncomeForm({
          expected_amount: settings.expected_amount?.toString() || "",
          next_payday: settings.next_payday || "",
          frequency: settings.frequency || splitData?.frequency || "monthly",
          use_expected_when_no_actual: settings.use_expected_when_no_actual !== false,
        });
      } else {
        setExpectedIncomeForm({
          expected_amount: "",
          next_payday: "",
          frequency: splitData?.frequency || "monthly",
          use_expected_when_no_actual: true,
        });
      }
    }
  }, [selectedSplitForIncome, incomeSettings, savedSplits]);

  const loadSplitsAndIncomeSettings = async () => {
    setIsLoadingIncome(true);
    try {
      // Load splits
      const splitsResponse = await fetch(`${API_URL}/splits`, {
        headers: { ...getAuthHeaders() },
      });

      if (splitsResponse.ok) {
        const splits = await splitsResponse.json();
        setSavedSplits(splits);
        if (splits.length > 0 && !selectedSplitForIncome) {
          setSelectedSplitForIncome(splits[0].id);
        }
      }

      // Load income settings
      const incomeSettingsResponse = await fetch(`${API_URL}/income-settings`, {
        headers: { ...getAuthHeaders() },
      });

      if (incomeSettingsResponse.ok) {
        const settings = await incomeSettingsResponse.json();
        setIncomeSettings(settings);
      }
    } catch (err) {
      console.error("Error loading splits and income settings:", err);
    } finally {
      setIsLoadingIncome(false);
    }
  };

  const handleSaveExpectedIncome = async () => {
    if (!selectedSplitForIncome) return;

    try {
      const payload = {
        split_id: selectedSplitForIncome,
        expected_amount: Math.abs(parseFloat(expectedIncomeForm.expected_amount) || 0),
        frequency: expectedIncomeForm.frequency,
        next_payday: expectedIncomeForm.next_payday || null,
        use_expected_when_no_actual: expectedIncomeForm.use_expected_when_no_actual,
      };

      const response = await fetch(`${API_URL}/income-settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const saved = await response.json();
        setIncomeSettings((prev) => {
          const existing = prev.findIndex((s) => s.split_id === selectedSplitForIncome);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = saved;
            return updated;
          }
          return [...prev, saved];
        });
        setIncomeSaveMessage("Expected income saved successfully!");
        setTimeout(() => setIncomeSaveMessage(""), 3000);
      } else {
        setIncomeSaveMessage("Error: Failed to save expected income");
        setTimeout(() => setIncomeSaveMessage(""), 3000);
      }
    } catch (err) {
      console.error("Error saving expected income:", err);
      setIncomeSaveMessage("Error: Failed to save expected income");
      setTimeout(() => setIncomeSaveMessage(""), 3000);
    }
  };

  const selectedIncomeSettings = incomeSettings.find(s => s.split_id === selectedSplitForIncome);
  const selectedSplitData = savedSplits.find(s => s.id === selectedSplitForIncome);

  const handleResetClick = () => {
    setShowConfirmModal(true);
  };

  const confirmReset = async () => {
    try {
      setIsResetting(true);
      setResetMessage("Clearing transactions...");

      // Clear all transactions via context (single bulk delete API call)
      await clearTransactions();

      // Clear localStorage data related to transactions
      localStorage.removeItem("walletwarden:transactions:v1");

      setResetMessage("All transactions have been cleared successfully!");
      setShowConfirmModal(false);
      setTimeout(() => {
        setResetMessage("");
        setIsResetting(false);
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

  const handleDisconnectBank = async () => {
    setBankLoading(true);
    try {
      const res = await fetch(`${API_URL}/banks/truelayer/disconnect`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        setBankStatus({ connected: false });
        setBankMessage("Bank disconnected successfully!");
      } else {
        setBankMessage("Failed to disconnect bank");
      }
    } catch (err) {
      console.error("Error disconnecting bank:", err);
      setBankMessage("Error disconnecting bank");
    } finally {
      setBankLoading(false);
      setTimeout(() => setBankMessage(""), 3000);
    }
  };

  const handleConnectBank = async () => {
    setBankLoading(true);
    setBankMessage(""); // Clear any previous messages
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
      const res = await fetch(`${API_URL}/banks/truelayer/connect`, {
        headers: { ...getAuthHeaders() },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (!data.url) {
        throw new Error("No redirect URL received from server");
      }
      
      // Redirect to TrueLayer - keep loading state since we're navigating away
      window.location.href = data.url;
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Connect bank error:", err);
      
      if (err.name === 'AbortError') {
        setBankMessage("Connection timed out. Please check your internet connection and try again.");
      } else {
        setBankMessage(err.message || "Failed to connect bank. Please try again.");
      }
      setBankLoading(false);
    }
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
            className={`nav-link ${activeTab === "income" ? "active" : ""}`}
            onClick={() => setActiveTab("income")}
          >
            💰 Income
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "banking" ? "active" : ""}`}
            onClick={() => setActiveTab("banking")}
          >
            🏦 Banking
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
                onClick={() => {
                  clearAuth0User(); // Clear stored Auth0 user ID
                  logout({ logoutParams: { returnTo: window.location.origin } });
                }}
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

      {/* Expected Income Tab */}
      {activeTab === "income" && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title mb-4">Expected Income Settings</h5>
            
            {incomeSaveMessage && (
              <div className={`alert alert-${incomeSaveMessage.includes("Error") ? "danger" : "success"} alert-dismissible fade show`} role="alert">
                {incomeSaveMessage}
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setIncomeSaveMessage("")}
                />
              </div>
            )}

            {isLoadingIncome ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="text-muted mt-2">Loading splits...</p>
              </div>
            ) : savedSplits.length === 0 ? (
              <div className="alert alert-info">
                <strong>No splits found.</strong> Create a budget split in the Tracker to configure expected income.
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="form-label">Select Budget Split</label>
                  <select
                    className="form-select"
                    value={selectedSplitForIncome || ""}
                    onChange={(e) => setSelectedSplitForIncome(e.target.value)}
                  >
                    {savedSplits.map(split => (
                      <option key={split.id} value={split.id}>
                        {split.name} ({split.frequency})
                      </option>
                    ))}
                  </select>
                </div>

                <hr className="my-4" />

                <p className="text-muted mb-3">
                  Set expected income for <strong>{selectedSplitData?.name || 'this split'}</strong>. 
                  This will be used for budget calculations when no actual income has been imported yet.
                </p>

                <div className="mb-3">
                  <label className="form-label">Expected Amount (£)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={expectedIncomeForm.expected_amount}
                    onChange={(e) => setExpectedIncomeForm(prev => ({
                      ...prev,
                      expected_amount: e.target.value
                    }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Next Payday</label>
                  <input
                    type="date"
                    className="form-control"
                    value={expectedIncomeForm.next_payday}
                    onChange={(e) => setExpectedIncomeForm(prev => ({
                      ...prev,
                      next_payday: e.target.value
                    }))}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Pay Frequency</label>
                  <select
                    className="form-select"
                    value={expectedIncomeForm.frequency}
                    onChange={(e) => setExpectedIncomeForm(prev => ({
                      ...prev,
                      frequency: e.target.value
                    }))}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div className="form-check mb-4">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="useExpectedCheckboxOptions"
                    checked={expectedIncomeForm.use_expected_when_no_actual}
                    onChange={(e) => setExpectedIncomeForm(prev => ({
                      ...prev,
                      use_expected_when_no_actual: e.target.checked
                    }))}
                  />
                  <label className="form-check-label" htmlFor="useExpectedCheckboxOptions">
                    Use expected income when no actual income imported
                  </label>
                </div>

                {selectedIncomeSettings && (
                  <div className="alert alert-info py-2 small mb-4">
                    <i className="bi bi-info-circle me-1"></i>
                    Current settings: £{Number(selectedIncomeSettings.expected_amount || 0).toFixed(2)} {selectedIncomeSettings.frequency}
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  onClick={handleSaveExpectedIncome}
                  disabled={!expectedIncomeForm.expected_amount || Number(expectedIncomeForm.expected_amount) <= 0}
                >
                  💾 Save Expected Income
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Banking Tab */}
      {activeTab === "banking" && (
        <div className="card shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title mb-4">Open Banking Connection</h5>
            
            {bankMessage && (
              <div className={`alert alert-${bankMessage.includes("Error") || bankMessage.includes("Failed") || bankMessage.includes("timed out") ? "danger" : "success"} alert-dismissible fade show`} role="alert">
                {bankMessage}
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setBankMessage("")}
                />
              </div>
            )}

            <p className="text-muted mb-4">
              Connect your UK bank account via Open Banking (TrueLayer) to automatically import transactions.
            </p>

            {bankStatusLoading ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="text-muted mt-2 mb-0">Checking bank connection status...</p>
              </div>
            ) : bankStatus?.connected ? (
              <div>
                <div className="alert alert-success mb-4">
                  <strong>✅ Bank Connected</strong>
                  <br />
                  <small className="text-muted">
                    Connected on: {bankStatus.connectedAt ? new Date(bankStatus.connectedAt).toLocaleDateString() : "Unknown"}
                  </small>
                </div>

                <div className="d-grid gap-2">
                  <button
                    className="btn btn-outline-danger"
                    onClick={handleDisconnectBank}
                    disabled={bankLoading}
                  >
                    {bankLoading ? "⏳ Disconnecting..." : "🔌 Disconnect Bank"}
                  </button>
                </div>
                <p className="text-muted small mt-3 mb-0">
                  Disconnecting will remove your bank connection. You can reconnect the same or a different bank afterwards.
                  Your existing imported transactions will remain.
                </p>
              </div>
            ) : (
              <div>
                <div className="alert alert-secondary mb-4">
                  <strong>No bank connected</strong>
                  <br />
                  <small>Connect a bank to automatically sync transactions.</small>
                </div>

                <div className="d-grid gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={handleConnectBank}
                    disabled={bankLoading}
                  >
                    {bankLoading ? "⏳ Connecting..." : "🏦 Connect Bank"}
                  </button>
                </div>
                <p className="text-muted small mt-3 mb-0">
                  You'll be redirected to TrueLayer to securely link your bank account.
                </p>
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
