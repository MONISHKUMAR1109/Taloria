/**
 * Email delivery is out of scope for v1. In every environment the service
 * "sends" by logging a clickable link to the server console (Render Logs);
 * integration with an email provider is a drop-in replacement for
 * `sendRawEmail`. It never throws — a transport failure must not break the
 * signup/forgot-password flow.
 */
export async function sendVerificationEmail(email, token) {
  const url = `${envFrontBase()}/verify-email?token=${encodeURIComponent(token)}`;
  console.log(`[mailer] verify ${email}\n  ${url}`);
}

export async function sendPasswordResetEmail(email, token) {
  const url = `${envFrontBase()}/reset-password?token=${encodeURIComponent(token)}`;
  console.log(`[mailer] reset ${email}\n  ${url}`);
}

function envFrontBase() {
  return process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
}