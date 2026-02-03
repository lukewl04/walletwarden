import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";

// Chevron SVG icon
const ChevronDown = ({ isOpen }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{
      transition: 'transform 150ms ease',
      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
    }}
  >
    <path
      d="M2.5 4.5L6 8L9.5 4.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Check icon for selected item
const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11.5 4L5.5 10L2.5 7"
      stroke="#3b82f6"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Custom dropdown styles
const dropdownStyles = {
  container: {
    position: 'relative',
    display: 'inline-block',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '9999px',
    color: 'var(--text, #e2e8f0)',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
    minWidth: '180px',
    justifyContent: 'space-between',
  },
  triggerHover: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  triggerFocus: {
    outline: 'none',
    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.4)',
  },
  panel: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    minWidth: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
    padding: '6px',
    zIndex: 1000,
    maxHeight: '240px',
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: '8px',
    color: 'var(--text, #e2e8f0)',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'background-color 150ms ease',
    whiteSpace: 'nowrap',
  },
  itemHover: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  itemActive: {
    fontWeight: 600,
    color: '#3b82f6',
  },
  placeholder: {
    color: 'var(--muted, #94a3b8)',
  },
};

export default function TrackerHeader({
  savedSplits,
  selectedSplit,
  setSelectedSplit,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  // Get selected split data
  const selectedSplitData = savedSplits.find(s => s.id === selectedSplit);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (!isOpen) {
        event.preventDefault();
        setIsOpen(true);
      }
    } else if (event.key === 'ArrowDown' && isOpen) {
      event.preventDefault();
      const currentIndex = savedSplits.findIndex(s => s.id === selectedSplit);
      const nextIndex = currentIndex < savedSplits.length - 1 ? currentIndex + 1 : 0;
      setSelectedSplit(savedSplits[nextIndex].id);
    } else if (event.key === 'ArrowUp' && isOpen) {
      event.preventDefault();
      const currentIndex = savedSplits.findIndex(s => s.id === selectedSplit);
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : savedSplits.length - 1;
      setSelectedSplit(savedSplits[prevIndex].id);
    }
  };

  const handleSelect = (splitId) => {
    setSelectedSplit(splitId);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="mb-4">
      {savedSplits.length === 0 ? (
        <div className="alert alert-info">No saved splits found. Create a split on the Split Maker page first!</div>
      ) : (
        <div className="d-flex gap-3 align-items-center mb-3 flex-wrap">
          <div style={dropdownStyles.container} ref={containerRef}>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              onKeyDown={handleKeyDown}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={{
                ...dropdownStyles.trigger,
                ...(isHovered ? dropdownStyles.triggerHover : {}),
                ...(isFocused ? dropdownStyles.triggerFocus : {}),
              }}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
            >
              <span style={!selectedSplitData ? dropdownStyles.placeholder : {}}>
                {selectedSplitData 
                  ? `${selectedSplitData.name} (${selectedSplitData.frequency})`
                  : 'Choose a split'
                }
              </span>
              <ChevronDown isOpen={isOpen} />
            </button>

            {isOpen && (
              <div 
                style={dropdownStyles.panel}
                role="listbox"
                aria-label="Select a split"
              >
                {savedSplits.map((split) => {
                  const isSelected = split.id === selectedSplit;
                  const isItemHovered = hoveredItem === split.id;
                  
                  return (
                    <div
                      key={split.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(split.id)}
                      onMouseEnter={() => setHoveredItem(split.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                      style={{
                        ...dropdownStyles.item,
                        ...(isItemHovered ? dropdownStyles.itemHover : {}),
                        ...(isSelected ? dropdownStyles.itemActive : {}),
                      }}
                    >
                      <span>{split.name} ({split.frequency})</span>
                      {isSelected && <CheckIcon />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Link 
            className="segmented-control__segment segmented-control__segment--active" 
            to="/splitmaker"
            style={{ textDecoration: 'none' }}
          >
            Split Maker
          </Link>
          <h1 className="h4 mb-0 ms-auto">
            Warden <span className="text-primary">Tracker</span>
          </h1>
        </div>
      )}
    </div>
  );
}
