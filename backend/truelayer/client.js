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
 * Get transactions for a specific account (handles pagination)
 * @param {Object} options
 * @param {string} options.access_token - Valid access token
 * @param {string} options.account_id - TrueLayer account ID
 * @param {string} [options.from] - Start date YYYY-MM-DD
 * @param {string} [options.to] - End date YYYY-MM-DD
 * @returns {Promise<Array>} List of all transactions
 */
async function getTransactions({ access_token, account_id, from, to }) {
  let allTransactions = [];
  let url = `${config.DATA_BASE_URL}/data/v1/accounts/${account_id}/transactions`;
  
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  
  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  // Fetch all pages of transactions
  let hasMore = true;
  let currentUrl = url;
  
  while (hasMore) {
    const response = await fetch(currentUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 401) throw new Error('Access token expired or invalid');
      if (status === 403) {
        // 403 can mean: bank doesn't support transactions, consent not granted, or account type doesn't support it
        const errorBody = await response.text().catch(() => '');
        console.log(`[TrueLayer] 403 response for transactions: ${errorBody}`);
        throw new Error(`Transaction access denied (403). This account may not support transaction history.`);
      }
      throw new Error(`Failed to fetch transactions: ${status}`);
    }

    const data = await response.json();
    const results = data.results || [];
    allTransactions = allTransactions.concat(results);
    
    // Check for next page
    if (data.next) {
      currentUrl = data.next;
    } else {
      hasMore = false;
    }
  }
  
  console.log(`[TrueLayer] Fetched ${allTransactions.length} transactions for account ${account_id}`);
  return allTransactions;
}

/**
 * Get account balance from TrueLayer
 * @param {Object} options
 * @param {string} options.access_token - Valid access token
 * @param {string} options.account_id - TrueLayer account ID
 * @returns {Promise<Object>} Balance info { current, available, currency }
 */
async function getBalance({ access_token, account_id }) {
  const response = await fetch(`${config.DATA_BASE_URL}/data/v1/accounts/${account_id}/balance`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error('Access token expired or invalid');
    throw new Error(`Failed to fetch balance: ${status}`);
  }

  const data = await response.json();
  const balance = data.results?.[0] || {};
  return {
    current: balance.current || 0,
    available: balance.available || balance.current || 0,
    currency: balance.currency || 'GBP',
  };
}

module.exports = {
  buildAuthUrl,
  exchangeCodeForToken,
  refreshToken,
  getAccounts,
  getTransactions,
  getBalance,
};
