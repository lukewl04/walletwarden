/**
 * TrueLayer Configuration
 * Reads environment variables and provides URLs for sandbox vs production
 */

const ENV = process.env.TRUELAYER_ENV || 'sandbox';
const IS_SANDBOX = ENV === 'sandbox';

// TrueLayer URLs based on environment
const SANDBOX_AUTH_URL = 'https://auth.truelayer-sandbox.com';
const SANDBOX_DATA_URL = 'https://api.truelayer-sandbox.com';
const PROD_AUTH_URL = 'https://auth.truelayer.com';
const PROD_DATA_URL = 'https://api.truelayer.com';

const config = {
  ENV,
  IS_SANDBOX,
  
  // Auth endpoints
  AUTH_BASE_URL: IS_SANDBOX ? SANDBOX_AUTH_URL : PROD_AUTH_URL,
  TOKEN_URL: IS_SANDBOX 
    ? `${SANDBOX_AUTH_URL}/connect/token` 
    : `${PROD_AUTH_URL}/connect/token`,
  
  // Data API endpoint
  DATA_BASE_URL: IS_SANDBOX ? SANDBOX_DATA_URL : PROD_DATA_URL,
  
  // Credentials (NEVER expose these to frontend)
  CLIENT_ID: process.env.TRUELAYER_CLIENT_ID || '',
  CLIENT_SECRET: process.env.TRUELAYER_CLIENT_SECRET || '',
  REDIRECT_URI: process.env.TRUELAYER_REDIRECT_URI || 'http://localhost:4000/api/banks/truelayer/callback',
  
  // Scopes for data access
  SCOPES: process.env.TRUELAYER_SCOPES || 'info accounts balance transactions',
  
  // Frontend URL for post-auth redirect
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};

// Validate required config
function validateConfig() {
  const missing = [];
  if (!config.CLIENT_ID) missing.push('TRUELAYER_CLIENT_ID');
  if (!config.CLIENT_SECRET) missing.push('TRUELAYER_CLIENT_SECRET');
  
  if (missing.length > 0) {
    console.warn(`⚠️  TrueLayer config incomplete. Missing: ${missing.join(', ')}`);
    console.warn('   Bank connection features will not work until these are set.');
    return false;
  }
  return true;
}

module.exports = {
  ...config,
  validateConfig,
};
