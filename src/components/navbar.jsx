import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

/* Segmented nav pill styles */
const segmentedNavStyles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: '9999px',
    padding: '4px',
    gap: '2px',
  },
  segment: {
    padding: '6px 16px',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'background-color 180ms ease, color 180ms ease, box-shadow 180ms ease',
    border: 'none',
    outline: 'none',
  },
  active: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    boxShadow: '0 0 8px rgba(59, 130, 246, 0.4)',
  },
  inactive: {
    backgroundColor: 'transparent',
    color: 'rgba(148, 163, 184, 0.9)',
  },
};

const THEME_KEY = "walletwarden:theme";
const PROFILE_PICTURE_KEY = "walletwarden:profilePicture";

const Navbar = () => {
  const { user } = useAuth0();
  const location = useLocation();
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem(THEME_KEY) || "dark";
  });
  const [profilePicture, setProfilePicture] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(PROFILE_PICTURE_KEY);
  });
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showSettingsTooltip, setShowSettingsTooltip] = useState(false);
  const [hasSplits, setHasSplits] = useState(false);

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

  // Check if user has any splits
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedSplits = JSON.parse(localStorage.getItem("walletwardenSplits") || "[]");
    setHasSplits(savedSplits.length > 0);
    
    // Listen for changes to splits
    const handleStorageChange = () => {
      const updated = JSON.parse(localStorage.getItem("walletwardenSplits") || "[]");
      setHasSplits(updated.length > 0);
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

  // Show settings tooltip after 30 seconds, then hide after 15 seconds (max 4 times)
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const SETTINGS_TOOLTIP_KEY = "walletwarden:settingsTooltipCount";
    const tooltipCount = parseInt(localStorage.getItem(SETTINGS_TOOLTIP_KEY) || "0", 10);
    
    // Only show if we haven't shown it 4 times yet
    if (tooltipCount < 4) {
      const showTimer = setTimeout(() => {
        setShowSettingsTooltip(true);
      }, 30000); // 30 seconds

      const hideTimer = setTimeout(() => {
        setShowSettingsTooltip(false);
        // Increment the count when tooltip is hidden
        localStorage.setItem(SETTINGS_TOOLTIP_KEY, String(tooltipCount + 1));
      }, 45000); // 45 seconds (30 + 15)

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <nav className="navbar navbar-expand-lg shadow-sm fixed-top">
      <div className="container">
        {/* Brand */}
        <Link className="navbar-brand fw-bold d-flex align-items-center gap-1" to="/">
          <img 
            src="/walletwardenlogo.png"   
            alt="WalletWarden Logo" 
            style={{ width: '50px', height: '50px', objectFit: 'contain' }} 
          />
          <span className="text-primary">Wallet</span>Warden 
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
            {/* Segmented Nav Pill */}
            <li className="nav-item">
              <div style={segmentedNavStyles.container}>
                <Link
                  to="/wardeninsights"
                  style={{
                    ...segmentedNavStyles.segment,
                    ...(location.pathname === '/wardeninsights' ? segmentedNavStyles.active : segmentedNavStyles.inactive),
                  }}
                  onMouseEnter={(e) => {
                    if (location.pathname !== '/wardeninsights') {
                      e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                      e.currentTarget.style.color = 'rgba(203, 213, 225, 1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (location.pathname !== '/wardeninsights') {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'rgba(148, 163, 184, 0.9)';
                    }
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.outline = '2px solid rgba(59, 130, 246, 0.5)';
                    e.currentTarget.style.outlineOffset = '2px';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = 'none';
                  }}
                >
                  Insights
                </Link>
                {hasSplits && (
                  <Link
                    to="/tracker"
                    style={{
                      ...segmentedNavStyles.segment,
                      ...(location.pathname === '/tracker' ? segmentedNavStyles.active : segmentedNavStyles.inactive),
                    }}
                    onMouseEnter={(e) => {
                      if (location.pathname !== '/tracker') {
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                        e.currentTarget.style.color = 'rgba(203, 213, 225, 1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (location.pathname !== '/tracker') {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'rgba(148, 163, 184, 0.9)';
                      }
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.outline = '2px solid rgba(59, 130, 246, 0.5)';
                      e.currentTarget.style.outlineOffset = '2px';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.outline = 'none';
                    }}
                  >
                    Tracker
                  </Link>
                )}
              </div>
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

                {showSettingsTooltip && (
                  <div 
                    className="settings-tooltip"
                    style={{
                      position: 'absolute',
                      top: '50px',
                      right: '0',
                      backgroundColor: 'var(--card-bg)',
                      border: '2px solid #0d6efd',
                      borderRadius: '0.5rem',
                      padding: '0.75rem 1rem',
                      whiteSpace: 'nowrap',
                      fontSize: '0.9rem',
                      zIndex: 1001,
                      animation: 'fadeInOut 15s ease-in-out',
                      boxShadow: '0 4px 12px rgba(13, 110, 253, 0.3)',
                    }}
                  >
                    <div 
                      style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '15px',
                        width: '0',
                        height: '0',
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderBottom: '10px solid #0d6efd',
                      }}
                    />
                    Settings can be found here ☝️
                  </div>
                )}

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
                    <hr className="dropdown-divider my-2" />
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        toggleTheme();
                        setShowProfileDropdown(false);
                      }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    >
                      {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
                    </button>
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
