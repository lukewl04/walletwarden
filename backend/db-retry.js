/**
 * db-retry.js — Retry helper for transient Supabase connection pooler errors.
 *
 * The Supabase pooler (`pooler.supabase.com`) can intermittently return
 * "Tenant or user not found" FATAL errors when it fails to resolve the
 * project tenant on a new connection. This wrapper retries such operations
 * with exponential backoff so the app stays resilient.
 */

const TRANSIENT_MESSAGES = [
  'Tenant or user not found',
  'Connection terminated',
  'connection terminated',
  'ECONNRESET',
  'ETIMEDOUT',
  'too many clients',
  'remaining connection slots',
];

function isTransientError(err) {
  const msg = err?.message || '';
  return TRANSIENT_MESSAGES.some(t => msg.includes(t));
}

/**
 * Retry an async function on transient DB errors.
 * @param {() => Promise<T>} fn     — async function to execute
 * @param {object}           opts
 * @param {number}           opts.retries — max retries (default 2)
 * @param {number}           opts.delay   — base delay ms (default 500)
 * @param {string}           opts.label   — log prefix (default 'DB')
 * @returns {Promise<T>}
 */
async function withRetry(fn, { retries = 2, delay = 500, label = 'DB' } = {}) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientError(err) || attempt > retries) throw err;
      const wait = delay * attempt; // linear backoff (500, 1000, …)
      console.warn(
        `[${label}] Transient error (attempt ${attempt}/${retries + 1}): ${err.message} — retrying in ${wait}ms`
      );
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

module.exports = { withRetry, isTransientError };
