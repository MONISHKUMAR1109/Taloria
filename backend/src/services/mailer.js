import env from '../config/env.js';

/**
 * Email delivery is out of scope for v1. In development the service "sends"
 * by logging a clickable link to the server console; integration with an
 * email provider is a drop-in replacement for `sendRawEmail`.
 */
const isDev = env.nodeEnv !== 'production';

export async function sendVerificationEmail(email, token) {
  const url = `${envFrontBase()}/verify-email?token=${encodeURIComponent(token)}`;
  if (isDev) {
    console.log(`[mailer] verify ${email}\n  ${url}`);
    return;
  }
  throw new Error('Email provider not configured.');
}

export async function sendPasswordResetEmail(email, token) {
  const url = `${envFrontBase()}/reset-password?token=${encodeURIComponent(token)}`;
  if (isDev) {
    console.log(`[mailer] reset ${email}\n  ${url}`);
    return;
  }
  throw new Error('Email provider not configured.');
}

function envFrontBase() {
  return process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
}