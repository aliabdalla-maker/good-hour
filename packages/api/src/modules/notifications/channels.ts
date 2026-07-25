import { config, featureFlags } from "../../config";

export interface ChannelResult {
  delivered: "provider" | "logged";
  providerRef?: string;
}

/**
 * Sends a transactional/marketing email via Resend. With no RESEND_API_KEY
 * configured it falls back to console logging so the whole flow is testable
 * without an email account.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<ChannelResult> {
  if (!featureFlags.emailEnabled) {
    // eslint-disable-next-line no-console
    console.log(`[email:logged] -> ${to} | ${subject}\n${body}`);
    return { delivered: "logged" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: config.EMAIL_FROM, to, subject, text: body }),
  });

  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(`[email:error] ${res.status} ${await res.text()}`);
    return { delivered: "logged" };
  }
  const data = (await res.json()) as { id?: string };
  return { delivered: "provider", providerRef: data.id };
}

/**
 * Sends an SMS via Twilio's REST API. With no Twilio credentials configured
 * it falls back to console logging.
 */
export async function sendSms(to: string, body: string): Promise<ChannelResult> {
  if (!featureFlags.smsEnabled) {
    // eslint-disable-next-line no-console
    console.log(`[sms:logged] -> ${to}\n${body}`);
    return { delivered: "logged" };
  }

  const sid = config.TWILIO_ACCOUNT_SID as string;
  const token = config.TWILIO_AUTH_TOKEN as string;
  const params = new URLSearchParams({
    To: to,
    From: config.TWILIO_FROM_NUMBER as string,
    Body: body,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(`[sms:error] ${res.status} ${await res.text()}`);
    return { delivered: "logged" };
  }
  const data = (await res.json()) as { sid?: string };
  return { delivered: "provider", providerRef: data.sid };
}
