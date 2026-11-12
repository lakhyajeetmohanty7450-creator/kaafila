import { env } from '../config/env.js';

let devEmailSink = null;

/**
 * Registers an in-memory delivery sink for automated tests or local dev inspection.
 * Never logs raw reset tokens to stdout/stderr.
 */
export function setDevEmailSink(sink) {
  devEmailSink = typeof sink === 'function' ? sink : null;
}

/**
 * Development-only password reset delivery adapter.
 * Production requires configuring a transactional email provider (e.g. Resend, AWS SES,
 * Postmark, or authenticated SMTP) without logging reset tokens.
 */
export async function sendPasswordResetEmail({ to, resetToken, expiresInMinutes = 15 }) {
  const clientBase = env.clientUrl.split(',')[0].trim().replace(/\/+$/, '');
  const resetUrl = `${clientBase}/reset-password?token=${encodeURIComponent(resetToken)}`;

  if (env.nodeEnv === 'production') {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'password_reset_email_adapter_unconfigured',
        message: 'No production email transport configured; reset email was not sent.',
      })
    );
    return { delivered: false, mode: 'unconfigured_production' };
  }

  if (devEmailSink) {
    await devEmailSink({ to, resetToken, resetUrl, expiresInMinutes });
    return { delivered: true, mode: 'dev_sink' };
  }

  // In local development without a sink, acknowledge delivery without logging the raw token.
  return { delivered: true, mode: 'dev_noop' };
}

