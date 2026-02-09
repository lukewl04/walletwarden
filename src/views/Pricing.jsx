// src/views/Pricing.jsx
// Shows Free / Plus / Pro plan cards with upgrade + manage billing actions.
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/navbar.jsx";
import { getUserToken } from "../utils/userToken";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const PLANS = [
  {
    tier: "free",
    name: "Free",
    price: "£0",
    period: "forever",
    features: [
      "Basic transaction tracking",
      "1 bank connection / week",
      "Standard insights dashboard",
    ],
    color: "#64748b",
  },
  {
    tier: "plus",
    name: "Plus",
    price: "£5",
    period: "/ month",
    features: [
      "Everything in Free",
      "CSV & PDF export",
      "3 bank connections / week",
      "Customise insights layout",
    ],
    color: "#3b82f6",
    popular: true,
  },
  {
    tier: "pro",
    name: "Pro",
    price: "£6.99",
    period: "/ month",
    features: [
      "Everything in Plus",
      "LLM-powered insights",
      "Full insights suite",
      "Unlimited bank connections",
    ],
    color: "#8b5cf6",
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const [currentTier, setCurrentTier] = useState("free");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // tier or 'portal'

  const getAuthHeaders = useCallback(
    () => ({ Authorization: `Bearer ${getUserToken()}`, "Content-Type": "application/json" }),
    []
  );

  // Fetch current plan on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/billing/me`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Failed to fetch plan");
        const data = await res.json();
        if (!cancelled) setCurrentTier(data.plan_tier || "free");
      } catch (err) {
        console.error("[Pricing] Error loading plan:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getAuthHeaders]);

  // Initiate Stripe Checkout
  const handleUpgrade = async (tier) => {
    setActionLoading(tier);
    try {
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("[Pricing] No checkout URL returned:", data);
        alert(data.error || "Something went wrong. Please try again.");
      }
    } catch (err) {
      console.error("[Pricing] Checkout error:", err);
      alert("Unable to start checkout. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  // Open Stripe Customer Portal
  const handleManageBilling = async () => {
    setActionLoading("portal");
    try {
      const res = await fetch(`${API_URL}/billing/portal`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("[Pricing] No portal URL returned:", data);
        alert(data.error || "Unable to open billing portal.");
      }
    } catch (err) {
      console.error("[Pricing] Portal error:", err);
      alert("Unable to open billing portal. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const tierOrder = ["free", "plus", "pro"];
  const isCurrentOrLower = (tier) => tierOrder.indexOf(tier) <= tierOrder.indexOf(currentTier);

  return (
    <div className="container-fluid py-4 mt-5" style={{ maxWidth: 1000, minHeight: "100vh" }}>
      <Navbar />

      <div className="text-center mb-4">
        <h2 className="h4 mb-2">Choose your plan</h2>
        <p className="text-muted">
          Upgrade anytime. Downgrade or cancel from the billing portal.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" />
          <p className="mt-2 text-muted">Loading plans…</p>
        </div>
      ) : (
        <>
          <div className="row g-4 justify-content-center">
            {PLANS.map((plan) => {
              const isCurrent = currentTier === plan.tier;
              const isLower = tierOrder.indexOf(plan.tier) < tierOrder.indexOf(currentTier);

              return (
                <div key={plan.tier} className="col-12 col-md-4">
                  <div
                    className="card h-100 shadow-sm"
                    style={{
                      borderTop: `3px solid ${plan.color}`,
                      position: "relative",
                    }}
                  >
                    {plan.popular && (
                      <span
                        className="badge"
                        style={{
                          position: "absolute",
                          top: -12,
                          right: 16,
                          backgroundColor: plan.color,
                          fontSize: "0.75rem",
                          padding: "4px 10px",
                        }}
                      >
                        Popular
                      </span>
                    )}
                    <div className="card-body d-flex flex-column">
                      <h5 className="card-title" style={{ color: plan.color }}>
                        {plan.name}
                      </h5>
                      <div className="mb-3">
                        <span style={{ fontSize: "2rem", fontWeight: 700 }}>{plan.price}</span>
                        <span className="text-muted ms-1" style={{ fontSize: "0.9rem" }}>
                          {plan.period}
                        </span>
                      </div>

                      <ul className="list-unstyled mb-4" style={{ flex: 1 }}>
                        {plan.features.map((f, i) => (
                          <li key={i} className="mb-2 d-flex align-items-start gap-2">
                            <span style={{ color: plan.color }}>✓</span>
                            <span style={{ fontSize: "0.9rem" }}>{f}</span>
                          </li>
                        ))}
                      </ul>

                      {isCurrent ? (
                        <button className="btn btn-outline-secondary w-100" disabled>
                          Current plan
                        </button>
                      ) : isLower ? (
                        <button
                          className="btn btn-outline-secondary w-100"
                          onClick={handleManageBilling}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === "portal" ? "Opening…" : "Manage plan"}
                        </button>
                      ) : (
                        <button
                          className="btn w-100"
                          style={{ backgroundColor: plan.color, color: "#fff", border: "none" }}
                          onClick={() => handleUpgrade(plan.tier)}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === plan.tier ? "Redirecting…" : `Upgrade to ${plan.name}`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Manage Billing button — only shown when user has a paid plan */}
          {currentTier !== "free" && (
            <div className="text-center mt-4">
              <button
                className="btn btn-outline-primary"
                onClick={handleManageBilling}
                disabled={actionLoading !== null}
              >
                {actionLoading === "portal" ? "Opening…" : "💳 Manage Billing"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
