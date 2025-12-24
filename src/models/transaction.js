// Lightweight transaction helpers
// Canonical shape:
// { id, type: 'income'|'expense', amount: number, date: ISO-string, category?, description? }

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function safeParseDate(input) {
  if (input instanceof Date && !isNaN(input)) return input;
  if (!input) return new Date();

  // Try built-in parsing first
  const d = new Date(input);
  if (!isNaN(d)) return d;

  // Strip ordinal suffixes (1st, 2nd, 3rd...) and append current year
  const stripped = String(input).replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
  const tryYear = new Date(`${stripped} ${new Date().getFullYear()}`);
  if (!isNaN(tryYear)) return tryYear;

  return new Date();
}

export function normalizeTransaction(t) {
  const type = (t.type || 'expense').toLowerCase() === 'income' ? 'income' : 'expense';
  const amount = Number(t.amount) || 0;
  const rawDate = t.date || new Date().toISOString();
  const dateObj = safeParseDate(rawDate);
  const date = dateObj.toISOString();
  const category = t.category || t.type || 'Other';
  const description = (t.description || '').toString().trim();
  const id = (t.id !== undefined && t.id !== null) ? String(t.id) : generateId();

  return { id, type, amount, date, category, description };
}

export function validateTransaction(t) {
  if (!t) return false;
  if (typeof t.amount !== 'number' || !Number.isFinite(t.amount) || t.amount <= 0) return false;
  if (!t.date) return false;
  if (!t.id) return false;
  return true;
}