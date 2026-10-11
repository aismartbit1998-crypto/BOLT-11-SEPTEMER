/*
 * Centralized Notification Service — Email + WhatsApp
 *
 * Uses Resend (or Nodemailer fallback) for email and Meta/Twilio WhatsApp API
 * for WhatsApp messages. Falls back to console.log when API keys are absent so
 * the platform remains fully functional in development without external creds.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotificationRecipient {
  id?: string;
  email: string;
  phone?: string | null;
  name?: string;
}

export interface NotificationResult {
  email: boolean;
  whatsapp: boolean;
  errors: string[];
}

// ─── Environment configuration ──────────────────────────────────────────────

const EMAIL_API_KEY = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'notifications@cortexai.com';
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'resend'; // 'resend' | 'nodemailer'

const WA_API_KEY = process.env.WA_API_KEY || '';
const WA_PHONE_ID = process.env.WA_PHONE_NUMBER_ID || '';
const WA_PROVIDER = process.env.WA_PROVIDER || 'meta'; // 'meta' | 'twilio'
const WA_API_URL = process.env.WA_API_URL || `https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`;

// ─── Email sending ───────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, htmlBody: string): Promise<boolean> {
  if (!EMAIL_API_KEY) {
    console.log(`[EMAIL FALLBACK] To: ${to} | Subject: ${subject}\n${htmlBody.replace(/<[^>]*>/g, '')}`);
    return true;
  }

  try {
    if (EMAIL_PROVIDER === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EMAIL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to,
          subject,
          html: htmlBody,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[EMAIL ERROR] Resend returned ${res.status}: ${errText}`);
        return false;
      }
      return true;
    }

    // Nodemailer-style SMTP (would need nodemailer installed; structure ready)
    console.log(`[EMAIL] Provider "${EMAIL_PROVIDER}" not available in this runtime. Fallback log for ${to}: ${subject}`);
    return true;
  } catch (err: any) {
    console.error(`[EMAIL ERROR] Failed to send to ${to}:`, err.message);
    return false;
  }
}

// ─── WhatsApp sending ────────────────────────────────────────────────────────

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  if (!WA_API_KEY || !WA_PHONE_ID) {
    console.log(`[WA FALLBACK] To: ${phone} | Message: ${message}`);
    return true;
  }

  try {
    if (WA_PROVIDER === 'meta') {
      const res = await fetch(WA_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(/\D/g, ''),
          type: 'text',
          text: { body: message },
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[WA ERROR] Meta API returned ${res.status}: ${errText}`);
        return false;
      }
      return true;
    }

    // Twilio WhatsApp API structure
    if (WA_PROVIDER === 'twilio') {
      const twilioUrl = process.env.WA_API_URL || 'https://api.twilio.com/2010-04-01/Accounts';
      const accountSid = process.env.WA_ACCOUNT_SID || '';
      const res = await fetch(`${twilioUrl}/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${WA_API_KEY}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: `whatsapp:${process.env.WA_FROM_NUMBER || ''}`,
          To: `whatsapp:${phone}`,
          Body: message,
        }).toString(),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[WA ERROR] Twilio returned ${res.status}: ${errText}`);
        return false;
      }
      return true;
    }

    return true;
  } catch (err: any) {
    console.error(`[WA ERROR] Failed to send to ${phone}:`, err.message);
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function sendNotification(
  recipient: NotificationRecipient,
  subject: string,
  body: { html: string; text: string },
  channels: { email: boolean; whatsapp: boolean },
): Promise<NotificationResult> {
  const errors: string[] = [];
  let emailOk = false;
  let waOk = false;

  if (channels.email) {
    emailOk = await sendEmail(recipient.email, subject, body.html);
    if (!emailOk) errors.push(`Email failed for ${recipient.email}`);
  }

  if (channels.whatsapp && recipient.phone) {
    waOk = await sendWhatsApp(recipient.phone, body.text);
    if (!waOk) errors.push(`WhatsApp failed for ${recipient.phone}`);
  }

  return { email: emailOk, whatsapp: waOk, errors };
}

// ─── Pre-built notification templates ───────────────────────────────────────

export async function sendWelcomeNotification(recipient: NotificationRecipient): Promise<void> {
  const subject = 'Welcome to Cortex AI — Your Trading Journey Begins';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #00d4ff;">Welcome to Cortex AI, ${recipient.name || 'Trader'}!</h1>
      <p>Your account has been successfully created on the Cortex AI platform.</p>
      <p>You now have access to AI-powered trading bots, smart boards, real-time signals, and professional risk management tools.</p>
      <p style="margin-top: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px;">
        <strong>Next Steps:</strong><br/>
        1. Connect your broker exchange via API keys<br/>
        2. Explore AI Smart Bots in the marketplace<br/>
        3. Configure your risk management settings<br/>
      </p>
      <p style="color: #666; font-size: 12px; margin-top: 30px;">© Cortex AI. Trade responsibly.</p>
    </div>
  `;
  const text = `Welcome to Cortex AI, ${recipient.name || 'Trader'}! Your account has been created. Connect your broker, explore AI bots, and start trading. Trade responsibly.`;

  await sendNotification(recipient, subject, { html, text }, { email: true, whatsapp: true });
}

export async function sendLicenseAllocationNotification(
  recipient: NotificationRecipient,
  details: { planName: string; botLimit: number; validUntil: string; licenseKey: string },
): Promise<void> {
  const subject = 'Your Cortex AI License is Now Active';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #00d4ff;">License Activated, ${recipient.name || 'Trader'}!</h1>
      <p>Your Cortex AI license has been assigned and is now active.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Plan</td><td style="padding: 8px; border: 1px solid #eee;">${details.planName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Bot Limit</td><td style="padding: 8px; border: 1px solid #eee;">${details.botLimit} bots</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Valid Until</td><td style="padding: 8px; border: 1px solid #eee;">${new Date(details.validUntil).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">License Key</td><td style="padding: 8px; border: 1px solid #eee; font-family: monospace;">${details.licenseKey}</td></tr>
      </table>
      <p>Log in to your dashboard to start using your allocated bots and strategies.</p>
      <p style="color: #666; font-size: 12px; margin-top: 30px;">© Cortex AI. Trade responsibly.</p>
    </div>
  `;
  const text = `Your Cortex AI license is active! Plan: ${details.planName}, Bots: ${details.botLimit}, Valid until: ${new Date(details.validUntil).toLocaleDateString()}. License key: ${details.licenseKey}. Log in to start trading.`;

  await sendNotification(recipient, subject, { html, text }, { email: true, whatsapp: true });
}

export async function sendLicenseExpiryNotification(
  recipient: NotificationRecipient,
  details: { planName: string; validUntil: string; daysLeft: number },
): Promise<void> {
  const subject = 'License Expiring Soon — Renew Now to Keep Trading';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #ff6b35;">License Expiring in ${details.daysLeft} day${details.daysLeft === 1 ? '' : 's'}</h1>
      <p>Dear ${recipient.name || 'Trader'},</p>
      <p>Your Cortex AI <strong>${details.planName}</strong> license will expire on <strong>${new Date(details.validUntil).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.</p>
      <p>To avoid interruption to your automated trading bots and signals, please renew your license before the expiry date.</p>
      <p style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; color: #856404;">
        <strong>Action Required:</strong> Contact your account manager or log in to renew your subscription.
      </p>
      <p style="color: #666; font-size: 12px; margin-top: 30px;">© Cortex AI. Trade responsibly.</p>
    </div>
  `;
  const text = `Your Cortex AI ${details.planName} license expires in ${details.daysLeft} day(s) on ${new Date(details.validUntil).toLocaleDateString()}. Renew now to avoid trading interruption.`;

  await sendNotification(recipient, subject, { html, text }, { email: true, whatsapp: true });
}

export async function sendBroadcastNotification(
  recipient: NotificationRecipient,
  subject: string,
  message: string,
  channels: { email: boolean; whatsapp: boolean },
): Promise<NotificationResult> {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #00d4ff;">${subject}</h1>
      <div style="margin: 20px 0; line-height: 1.6;">${message.replace(/\n/g, '<br/>')}</div>
      <p style="color: #666; font-size: 12px; margin-top: 30px;">© Cortex AI. Trade responsibly.</p>
    </div>
  `;
  return sendNotification(recipient, subject, { html, text: `${subject}\n\n${message}` }, channels);
}
