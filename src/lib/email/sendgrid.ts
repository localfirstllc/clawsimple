export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  listUnsubscribeUrl?: string;
};

const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

export async function sendEmail({
  to,
  subject,
  html,
  text,
  listUnsubscribeUrl,
}: SendEmailInput) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME ?? "MoltBot";

  if (!apiKey || !fromEmail) {
    throw new Error("SendGrid is not configured");
  }

  const response = await fetch(SENDGRID_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: to }],
          subject,
          headers: listUnsubscribeUrl
            ? {
                "List-Unsubscribe": `<${listUnsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : undefined,
        },
      ],
      from: {
        email: fromEmail,
        name: fromName,
      },
      content: [
        {
          type: "text/plain",
          value: text ?? html.replace(/<[^>]+>/g, " "),
        },
        {
          type: "text/html",
          value: html,
        },
      ],
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`SendGrid error: ${payload}`);
  }
}
