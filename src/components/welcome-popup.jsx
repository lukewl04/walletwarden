import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./welcome-popup.css";

export default function WelcomePopup() {
  const [showPopup, setShowPopup] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user has already dismissed the popup
    const hasDismissed = localStorage.getItem("walletwarden-dismissed-welcome");
    
    if (!hasDismissed) {
      const timer = setTimeout(() => {
        setShowPopup(true);
      }, 5000); // 5 seconds

      return () => clearTimeout(timer);
    }
  }, []);

  const handleYes = () => {
    // Set a flag to show help across pages
    localStorage.setItem("walletwarden-show-help", "true");
    navigate("/splitmaker", { state: { showHelp: true } });
  };

  const handleNo = () => {
    setShowPopup(false);
    localStorage.setItem("walletwarden-dismissed-welcome", "true");
  };

  return (
    <>
      {showPopup && (
        <div className="welcome-popup-overlay">
          <div className="welcome-popup">
            <div className="welcome-popup-content">
              <h2 className="welcome-popup-title">New to Warden Wallet?</h2>
              <div className="welcome-popup-buttons">
                <button 
                  className="btn btn-primary"
                  onClick={handleYes}
                >
                  Yes.. how do I use this?
                </button>
                <button 
                  className="btn btn-outline-secondary"
                  onClick={handleNo}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
