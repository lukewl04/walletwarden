/**
 * TrueLayer HTTP Client
 * Low-level HTTP calls to TrueLayer Auth & Data APIs
 * Uses native fetch (Node 18+)
 */

const config = require('./config');

/**
 * Build the TrueLayer authorization URL for the hosted auth flow
 * @param {Object} options
 * @param {string} options.state - CSRF state token
 * @returns {string} Full authorization URL
 */
function buildAuthUrl({ state }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.CLIENT_ID,
    redirect_uri: config.REDIRECT_URI,
    scope: config.SCOPES,
    state: state,
    // Enable mock providers in sandbox for testing
    ...(config.IS_SANDBOX && { providers: 'uk-ob-all uk-oauth-all uk-cs-mock' }),
  });
  
  return `${config.AUTH_BASE_URL}/?${params.toString()}`;
}

/**
 * Exchange authorization code for access/refresh tokens
 * @param {Object} options
 * @param {string} options.code - Authorization code from callback
 * @returns {Promise<Object>} Token response { access_token, refresh_token, expires_in, token_type }
 */
async function exchangeCodeForToken({ code }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    redirect_uri: config.REDIRECT_URI,
    code: code,
  });

  const response = await fetch(config.TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('TrueLayer token exchange failed:', response.status);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Refresh an access token using refresh token
 * @param {Object} options
 * @param {string} options.refresh_token - The refresh token
 * @returns {Promise<Object>} New token response
 */
async function refreshToken({ refresh_token }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    refresh_token: refresh_token,
  });

  const response = await fetch(config.TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('TrueLayer token refresh failed:', response.status);
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get list of connected accounts from TrueLayer Data API
 * @param {Object} options
 * @param {string} options.access_token - Valid access token
 * @returns {Promise<Array>} List of accounts
 */
async function getAccounts({ access_token }) {
  const response = await fetch(`${config.DATA_BASE_URL}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error('Access token expired or invalid');
    throw new Error(`Failed to fetch accounts: ${status}`);
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Get transactions for a specific account
 * @param {Object} options
 * @param {string} options.access_token - Valid access token
 * @param {string} options.account_id - TrueLayer account ID
 * @param {string} [options.from] - Start date YYYY-MM-DD
 * @param {string} [options.to] - End date YYYY-MM-DD
 * @returns {Promise<Array>} List of transactions
 */
async function getTransactions({ access_token, account_id, from, to }) {
  let url = `${config.DATA_BASE_URL}/data/v1/accounts/${account_id}/transactions`;
  
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  
  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error('Access token expired or invalid');
    throw new Error(`Failed to fetch transactions: ${status}`);
  }

  const data = await response.json();
  return data.results || [];
}

module.exports = {
  buildAuthUrl,
  exchangeCodeForToken,
  refreshToken,
  getAccounts,
  getTransactions,
};
