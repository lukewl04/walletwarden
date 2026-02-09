// src/views/BillingSuccess.jsx
// Shown after a successful Stripe Checkout redirect.
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/navbar.jsx";
import { getUserToken } from "../utils/userToken";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export default function BillingSuccess() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = useCallback(
    () => ({ Authorization: `Bearer ${getUserToken()}` }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 5;

    // Poll a few times because the webhook may arrive after the redirect
    async function fetchPlan() {
      try {
        const res = await fetch(`${API_URL}/billing/me`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Failed to fetch plan");
        const data = await res.json();
        if (!cancelled) {
          setPlan(data);
          // If still free and we haven't exhausted retries, try again
          if (data.plan_tier === "free" && attempts < maxAttempts) {
            attempts++;
            setTimeout(fetchPlan, 2000);
            return;
          }
          setLoading(false);
        }
      } catch (err) {
        console.error("[BillingSuccess] Error:", err);
        if (!cancelled) setLoading(false);
      }
    }

    fetchPlan();
    return () => { cancelled = true; };
  }, [getAuthHeaders]);

  const tierLabels = { free: "Free", plus: "Plus", pro: "Pro" };
  const tierColors = { free: "#64748b", plus: "#3b82f6", pro: "#8b5cf6" };

  return (
    <div className="container-fluid py-4 mt-5" style={{ maxWidth: 600, minHeight: "100vh" }}>
      <Navbar />

      <div className="card shadow-sm text-center">
        <div className="card-body py-5">
          {loading ? (
            <>
              <div className="spinner-border text-primary mb-3" role="status" />
              <p className="text-muted">Confirming your subscription…</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🎉</div>
              <h3 className="mb-2">You're all set!</h3>
              <p className="text-muted mb-4">
                Your plan has been updated to{" "}
                <strong style={{ color: tierColors[plan?.plan_tier] || "#3b82f6" }}>
                  {tierLabels[plan?.plan_tier] || plan?.plan_tier || "—"}
                </strong>
                .
              </p>

              {plan?.plan_status && (
                <p className="small text-muted mb-4">
                  Status: <strong>{plan.plan_status}</strong>
                  {plan.plan_current_period_end && (
                    <>
                      {" · "}Renews{" "}
                      {new Date(plan.plan_current_period_end).toLocaleDateString()}
                    </>
                  )}
                </p>
              )}

              <div className="d-flex justify-content-center gap-3">
                <button
                  className="btn btn-primary"
                  onClick={() => navigate("/wardeninsights")}
                >
                  Go to Dashboard
                </button>
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => navigate("/pricing")}
                >
                  View Plans
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
