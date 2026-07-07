import FormData from "form-data";
import Mailgun from "mailgun.js";
import type { SendEmailInput } from "./sendgrid";

const DEFAULT_FROM_NAME = "ClawSimple";
const DEFAULT_BASE_URL = "https://api.mailgun.net";

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ");

const formatFrom = (email: string, name?: string) => {
  if (!name) return email;
  if (email.includes("<")) return email;
  return `${name} <${email}>`;
};

export const isMailgunConfigured = () => {
  return Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
};

export async function sendMailgunEmail({
  to,
  subject,
  html,
  text,
  listUnsubscribeUrl,
}: SendEmailInput & { listUnsubscribeUrl?: string }) {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const fromEmail =
    process.env.MAILGUN_FROM_EMAIL?.trim() ||
    (domain ? `postmaster@${domain}` : "");
  const fromName = process.env.MAILGUN_FROM_NAME ?? DEFAULT_FROM_NAME;
  const baseUrl = process.env.MAILGUN_BASE_URL?.trim() || DEFAULT_BASE_URL;

  if (!apiKey || !domain) {
    throw new Error("Mailgun is not configured");
  }
  if (!fromEmail) {
    throw new Error("MAILGUN_FROM_EMAIL is required");
  }

  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({
    username: "api",
    key: apiKey,
    url: baseUrl,
  });

  const messageData: Record<string, unknown> = {
    from: formatFrom(fromEmail, fromName),
    to: [to],
    subject,
    text: text ?? stripHtml(html),
    html,
  };

  // Add List-Unsubscribe header for one-click unsubscribe
  if (listUnsubscribeUrl) {
    messageData["h:List-Unsubscribe"] = `<${listUnsubscribeUrl}>`;
    messageData["h:List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await mg.messages.create(domain, messageData as any);
  } catch (error) {
    throw new Error(`Mailgun error: ${String(error ?? "")}`);
  }
}
