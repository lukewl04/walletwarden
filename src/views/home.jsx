import Navbar from "../components/navbar.jsx";
import WelcomePopup from "../components/welcome-popup.jsx";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Home() {
  const navigate = useNavigate();
  const [message, setMessage] = useState(null);

  const presets = [
    {
      label: "Safe & Simple (Low Stress)",
      desc: "Best for stability and flexibility.",
      mapping: {
        Food: 20,
        Petrol: 10,
        Bills: 25,
        Shopping: 10,
        Entertainment: 10,
        Subscriptions: 5,
        Savings: 10,
        Investing: 10,
      },
      details: [
        "🏠 Needs (rent, bills, food, petrol): 55%",
        "🎮 Wants/hobbies (going out, subscriptions, fun): 25%",
        "💰 Savings + investing: 20%",
      ],
    },
    {
      label: "Balanced & Smart (Best Overall)",
      desc: "Best mix of fun now + money later.",
      mapping: {
        Food: 18,
        Petrol: 8,
        Bills: 14,
        Shopping: 10,
        Entertainment: 10,
        Subscriptions: 10,
        Savings: 10,
        Investing: 20,
      },
      details: ["🏠 Needs: 50%", "🎮 Wants: 20%", "📈 Investing: 20%", "💰 Savings: 10%"],
    },
    {
      label: "Aggressive / Future-Focused",
      desc: "Best if you're disciplined and want to build wealth.",
      mapping: {
        Food: 15,
        Petrol: 7,
        Bills: 13,
        Shopping: 10,
        Entertainment: 5,
        Subscriptions: 10,
        Savings: 10,
        Investing: 30,
      },
      details: ["🏠 Needs: 45%", "🎮 Wants: 15%", "📈 Investing: 30%", "💰 Savings: 10%"],
    },
  ];

  const handlePresetClick = (preset) => {
    navigate("/splitmaker", { state: { preset } });
  };

  return (
    <div className="container-fluid" style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>
      <WelcomePopup />
      <Navbar />

      <div className="container" style={{ maxWidth: "1200px", paddingTop: "5rem", paddingBottom: "2rem" }}>
        {/* Hero Section - Compact */}
        <div className="row align-items-center mb-4">
          <div className="col-12 col-md-5 text-center text-md-start">
            <img 
              src="/walletwardenlogo.png" 
              alt="Wallet Warden" 
              style={{ maxWidth: 200, marginBottom: '0' }}
            />
            <h1 className="display-6 fw-bold mb-3" style={{ color: "#fff" }}>
              Control your money,<br />
              before it controls you.
            </h1>
            <p className="lead mb-0" style={{ color: "#cbd5e1", fontSize: "1rem" }}>
              Track spending, split costs, and build better money habits — all in one place.
            </p>
          </div>

          {/* Quick Stats or Visual */}
          <div className="col-12 col-md-7 d-none d-md-block">
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              padding: "1rem"
            }}>
              <div className="p-3 rounded-3" style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                <div className="h6 mb-2" style={{ color: "#3b82f6" }}>💰 Track Spending</div>
                <p className="small text-muted mb-0">Monitor every transaction</p>
              </div>
              <div className="p-3 rounded-3" style={{ background: "rgba(168, 85, 247, 0.1)", border: "1px solid rgba(168, 85, 247, 0.3)" }}>
                <div className="h6 mb-2" style={{ color: "#a855f7" }}>📊 Smart Splits</div>
                <p className="small text-muted mb-0">Allocate with presets</p>
              </div>
              <div className="p-3 rounded-3" style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)" }}>
                <div className="h6 mb-2" style={{ color: "#22c55e" }}>📈 Build Wealth</div>
                <p className="small text-muted mb-0">Grow your savings</p>
              </div>
              <div className="p-3 rounded-3" style={{ background: "rgba(244, 114, 182, 0.1)", border: "1px solid rgba(244, 114, 182, 0.3)" }}>
                <div className="h6 mb-2" style={{ color: "#f472b6" }}>🎯 Stay on Track</div>
                <p className="small text-muted mb-0">Meet your goals</p>
              </div>
            </div>
          </div>
        </div>

        {/* Split Presets Container - Horizontal Cards */}
        <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(71, 85, 105, 0.3)", borderRadius: "1rem", padding: "2rem", backdropFilter: "blur(10px)" }}>
          <h2 className="h5 fw-bold mb-1" style={{ color: "#fff" }}>Get Started with Split Presets</h2>
          <p className="text-muted small mb-3">Choose a preset to allocate your income. Customize later if needed.</p>
          
          <div className="row g-3">
            {presets.map((preset) => (
              <div className="col-12 col-md-6 col-lg-4" key={preset.label}>
                <div 
                  className="h-100 p-4 rounded-3"
                  style={{
                    background: "rgba(30, 41, 59, 0.8)",
                    border: "1px solid rgba(71, 85, 105, 0.3)",
                    display: "flex",
                    flexDirection: "column",
                    cursor: "pointer",
                    transition: "all 0.3s ease"
                  }}
                  onClick={() => handlePresetClick(preset)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.6)";
                    e.currentTarget.style.background = "rgba(30, 41, 59, 1)";
                    e.currentTarget.style.boxShadow = "0 8px 32px rgba(59, 130, 246, 0.2)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(71, 85, 105, 0.3)";
                    e.currentTarget.style.background = "rgba(30, 41, 59, 0.8)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <h6 className="fw-bold mb-1" style={{ color: "#fff" }}>{preset.label}</h6>
                  <p className="text-muted small mb-2">{preset.desc}</p>
                  <div className="mb-3">
                    {preset.details.map((d, i) => (
                      <div key={i} className="small text-muted mb-1">{d}</div>
                    ))}
                  </div>
                  <div 
                    className="mt-auto text-center py-2 rounded"
                    style={{
                      background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                      color: "#fff",
                      borderRadius: "0.5rem",
                      fontWeight: "600",
                      fontSize: "0.875rem"
                    }}
                  >
                    Use this preset
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-3 d-flex justify-content-center justify-content-md-end">
            <button
              className="btn btn-sm"
              style={{
                background: "transparent",
                color: "#94a3b8",
                border: "1px solid #475569",
                borderRadius: "0.5rem",
                padding: "0.5rem 1rem"
              }}
              onClick={() => navigate("/splitmaker", { state: { skipPresetSelection: true } })}
            >
              Custom Preset
            </button>
          </div>
        </div>

        {/* Footer tagline */}
        <div className="text-center mt-4">
          <p className="text-muted small">Wallet Warden • Simple finance, done right</p>
        </div>
      </div>
    </div>
  );
}
