/**
 * UpgradePrompt — shown inline when a feature is locked behind a higher plan.
 *
 * Gracefully upsells without hiding UI. Renders as a subtle overlay or inline
 * badge that explains the lock and offers an upgrade path.
 *
 * Props:
 *   feature    — human-readable feature name (e.g. "CSV Export", "LLM Insights")
 *   plan       — minimum plan required ("plus" | "pro")
 *   inline     — if true, renders as a small badge instead of a card overlay
 *   onUpgrade  — optional callback (navigates to upgrade page / opens modal)
 */
import React from 'react';
import { useEntitlements } from '../state/EntitlementsContext';

const PLAN_LABELS = { plus: 'Plus', pro: 'Pro' };
const PLAN_PRICES = { plus: '£5/mo', pro: '£6.99/mo' };

export default function UpgradePrompt({ feature, plan = 'plus', inline = false, onUpgrade, children }) {
  const { plan: currentPlan } = useEntitlements();

  // If the user already has the required plan (or higher), render children normally
  const planOrder = ['free', 'plus', 'pro'];
  if (planOrder.indexOf(currentPlan) >= planOrder.indexOf(plan)) {
    return children || null;
  }

  if (inline) {
    return (
      <span
        className="badge"
        style={{
          background: 'rgba(13, 110, 253, 0.12)',
          color: 'rgba(13, 110, 253, 0.9)',
          fontSize: '0.7rem',
          fontWeight: 500,
          padding: '3px 8px',
          borderRadius: '6px',
          cursor: onUpgrade ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={onUpgrade}
        title={`${feature} requires ${PLAN_LABELS[plan]} (${PLAN_PRICES[plan]})`}
      >
        {PLAN_LABELS[plan]}
      </span>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Render children dimmed underneath the overlay */}
      {children && (
        <div style={{ opacity: 0.35, pointerEvents: 'none', filter: 'blur(1px)' }}>
          {children}
        </div>
      )}

      <div
        style={{
          position: children ? 'absolute' : 'relative',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '24px 16px',
          background: children ? 'rgba(18, 18, 28, 0.7)' : 'rgba(18, 18, 28, 0.04)',
          backdropFilter: children ? 'blur(4px)' : 'none',
          borderRadius: '12px',
          textAlign: 'center',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>

        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          {feature}
        </div>

        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', maxWidth: '220px' }}>
          Available on the {PLAN_LABELS[plan]} plan ({PLAN_PRICES[plan]})
        </div>

        {onUpgrade && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            style={{ fontSize: '0.78rem', padding: '4px 16px', marginTop: '4px' }}
            onClick={onUpgrade}
          >
            Upgrade
          </button>
        )}
      </div>
    </div>
  );
}
