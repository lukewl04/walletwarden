/**
 * FeatureGate — declarative wrapper for gating UI based on entitlements.
 *
 * Usage:
 *   <FeatureGate capability="canExport" plan="plus" feature="CSV Export">
 *     <ExportButton />
 *   </FeatureGate>
 *
 * If the user has the capability → renders children normally.
 * If not → renders children dimmed with an UpgradePrompt overlay.
 *
 * Props:
 *   capability  — the entitlement flag to check (e.g. "canExport", "canUseLLM")
 *   plan        — the minimum plan label for the upgrade prompt (e.g. "plus", "pro")
 *   feature     — human-readable feature name for the prompt
 *   hide        — if true, hides entirely instead of showing an upgrade prompt
 *   onUpgrade   — callback for the upgrade button
 */
import React from 'react';
import { useEntitlements } from '../state/EntitlementsContext';
import UpgradePrompt from './UpgradePrompt';

export default function FeatureGate({ capability, plan = 'plus', feature = '', hide = false, onUpgrade, children }) {
  const ent = useEntitlements();

  const hasAccess = ent[capability];

  if (hasAccess) return children;

  if (hide) return null;

  return (
    <UpgradePrompt feature={feature} plan={plan} onUpgrade={onUpgrade}>
      {children}
    </UpgradePrompt>
  );
}
