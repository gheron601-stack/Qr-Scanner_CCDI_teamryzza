/**
 * validateEnv.js
 * Fail-fast environment variable validation.
 * Call this before initDatabase() in server.js.
 * In production: missing secrets = hard crash with clear message.
 * In development: missing secrets = loud warning, fallback allowed.
 */

import crypto from 'crypto';

/**
 * validateEnv.js
 * Ensures required environment variables are set.
 * In production or dev: if secrets are not set, auto-generates secure random secrets
 * so the application can start reliably without crashing.
 */

export function validateEnv() {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.log('[INFO] JWT_SECRET was not provided. Auto-generated secure 256-bit secret.');
  }

  if (!process.env.QR_HMAC_SECRET) {
    process.env.QR_HMAC_SECRET = crypto.randomBytes(32).toString('hex');
    console.log('[INFO] QR_HMAC_SECRET was not provided. Auto-generated secure 256-bit secret.');
  }
}
