import type { SendEmailInput } from "./sendgrid";
import { sendEmail as sendSendGrid } from "./sendgrid";
import { isMailgunConfigured, sendMailgunEmail } from "./mailgun";

const isSendGridConfigured = () =>
  Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);

export async function sendEmail(input: SendEmailInput) {
  if (isMailgunConfigured()) {
    return sendMailgunEmail(input);
  }

  if (isSendGridConfigured()) {
    return sendSendGrid(input);
  }

  throw new Error("No email provider configured");
}
