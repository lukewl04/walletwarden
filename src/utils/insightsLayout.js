// src/utils/insightsLayout.js
// Shared constants & helpers for the customizable insights widget layout.

export const INSIGHT_WIDGET_CATALOG = [
  { type: "donut",            label: "Income vs Expense Donut",    icon: "🍩" },
  { type: "line",             label: "Monthly Trend Line Chart",   icon: "📈" },
  { type: "topExpenses",      label: "Top Expense Categories",     icon: "📊" },
  { type: "topMerchants",     label: "Top Merchants & Vendors",    icon: "🏪" },
  { type: "spendingForecast", label: "Spending Forecast",          icon: "🔮" },
  { type: "potentialSavings", label: "Where You Could Save",       icon: "💰" },
];

export const DEFAULT_INSIGHTS_LAYOUT = [
  { id: "donut-1",            type: "donut" },
  { id: "line-1",             type: "line" },
  { id: "topExpenses-1",      type: "topExpenses" },
  { id: "topMerchants-1",     type: "topMerchants" },
  { id: "spendingForecast-1", type: "spendingForecast" },
  { id: "potentialSavings-1", type: "potentialSavings" },
];

export const LAYOUT_STORAGE_KEY = "walletwarden:wardenInsightsLayout:v1";

const VALID_WIDGET_TYPES = new Set(INSIGHT_WIDGET_CATALOG.map(w => w.type));

/** Load persisted layout from localStorage; fallback to default on invalid data. */
export function loadInsightsLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_INSIGHTS_LAYOUT;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_INSIGHTS_LAYOUT;
    if (!arr.every(item => item.id && item.type && VALID_WIDGET_TYPES.has(item.type)))
      return DEFAULT_INSIGHTS_LAYOUT;
    return arr;
  } catch {
    return DEFAULT_INSIGHTS_LAYOUT;
  }
}

/** Persist layout array to localStorage. */
export function saveInsightsLayout(layout) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

/** Get the label for a widget type from the catalog. */
export function widgetLabel(type) {
  return INSIGHT_WIDGET_CATALOG.find(w => w.type === type)?.label ?? type;
}

/** Get the icon for a widget type from the catalog. */
export function widgetIcon(type) {
  return INSIGHT_WIDGET_CATALOG.find(w => w.type === type)?.icon ?? "📦";
}
