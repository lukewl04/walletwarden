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
    <div className="container-fluid py-5 mt-5" style={{ minHeight: "100vh" }}>
      <WelcomePopup />
      <Navbar />

      <div className="container text-center" style={{ maxWidth: 900 }}>
        {/* Hero */}
        <div className="mb-5">
          <img 
            src="/walletwardenfull.png" 
            alt="Wallet Warden" 
            style={{ maxWidth: 500, marginBottom: '1.5rem' }}
          />
          <h1 className="display-5 fw-bold mb-3">
            Control your money,<br className="d-none d-md-block" />
            before it controls you.
          </h1>

          <p className="lead text-muted mb-4">
            Track spending, split costs, and build better money habits — all in one place.
          </p>
        </div>

        {/* Split Presets Container */}
        <div className="card shadow-sm mt-5 mb-5">
          <div className="card-body">
            <h2 className="h4 mb-2">Get Started with Split Presets</h2>
            <p className="text-muted mb-4">Choose a preset to allocate your income by percentage. You can customize it later.</p>
            <div className="row g-3">
              {presets.map((preset) => (
                <div className="col-12 col-md-4" key={preset.label}>
                  <div className="card h-100 border-0 shadow-sm">
                    <div className="card-body d-flex flex-column">
                      <h5 className="card-title mb-1">{preset.label}</h5>
                      <p className="text-muted small mb-3">{preset.desc}</p>
                      <ul className="mb-3 small text-muted">
                        {preset.details.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                      <button
                        className="btn btn-primary mt-auto"
                        onClick={() => handlePresetClick(preset)}
                      >
                        Use this preset
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 d-flex justify-content-end">
              <button
                className="btn btn-outline-secondary"
                onClick={() => navigate("/splitmaker", { state: { skipPresetSelection: true } })}
              >
                Start with Custom Preset
              </button>
            </div>
          </div>
        </div>

        {/* Optional tagline */}
        <div className="text-muted small">
          Wallet Warden • Simple finance, done right
        </div>
      </div>
    </div>
  );
}
