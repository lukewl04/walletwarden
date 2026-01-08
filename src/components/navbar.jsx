import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

const THEME_KEY = "walletwarden:theme";
const PROFILE_PICTURE_KEY = "walletwarden:profilePicture";

const Navbar = () => {
  const { user } = useAuth0();
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem(THEME_KEY) || "dark";
  });
  const [profilePicture, setProfilePicture] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(PROFILE_PICTURE_KEY);
  });
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const next = theme === "light" ? "theme-light" : "theme-dark";
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(next);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Listen for storage changes to update profile picture
    const handleStorageChange = () => {
      const updated = localStorage.getItem(PROFILE_PICTURE_KEY);
      setProfilePicture(updated);
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showProfileDropdown && !e.target.closest('.profile-dropdown-container')) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showProfileDropdown]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <nav className="navbar navbar-expand-lg shadow-sm fixed-top">
      <div className="container">
        {/* Brand */}
        <Link className="navbar-brand fw-bold" to="/">
          Warden Wallet
        </Link>

        {/* Toggle Button */}
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* Links */}
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto align-items-lg-center gap-lg-3">
            <li className="nav-item">
              <Link className="nav-link active" to="/">
                Home
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link active" to="/wardeninsights">
                Insights
              </Link>
            </li>
                        
            <li className="nav-item">
              <Link className="nav-link active" to="/tracker">
                Tracker
              </Link>
            </li>
            
            <li className="nav-item">
              <Link className="nav-link active" to="/insighttracker">
                Insight Tracker
              </Link>
            </li>
            {/* Call to Action */}
            <li className="nav-item">
              <Link className="btn btn-primary px-4 rounded-pill" to="/splitmaker">
                Split Maker
              </Link>
            </li>

            <li className="nav-item ms-lg-3 mt-2 mt-lg-0">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={toggleTheme}
                aria-label="Toggle dark mode"
              >
                {theme === "light" ? "🌙 Dark" : "☀️ Light"}
              </button>
            </li>

            {user && (
              <li className="nav-item ms-lg-3 mt-2 mt-lg-0 position-relative profile-dropdown-container">
                <button
                  type="button"
                  className="btn p-0 border-0"
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  aria-label="Profile menu"
                >
                  <img
                    src={profilePicture || user.picture}
                    alt={user.name || "Profile"}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      cursor: 'pointer',
                    }}
                    title={user.name || user.email}
                  />
                </button>

                {showProfileDropdown && (
                  <div
                    className="dropdown-menu show position-absolute end-0 mt-2"
                    style={{
                      minWidth: '200px',
                      backgroundColor: 'var(--card-bg)',
                      border: '1px solid var(--card-border)',
                      borderRadius: '0.375rem',
                      zIndex: 1000,
                    }}
                  >
                    <div className="dropdown-header text-truncate small">
                      {user.name || user.email}
                    </div>
                    <hr className="dropdown-divider my-2" />
                    <Link
                      to="/options"
                      className="dropdown-item"
                      onClick={() => setShowProfileDropdown(false)}
                    >
                      ⚙️ Settings
                    </Link>
                  </div>
                )}
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
