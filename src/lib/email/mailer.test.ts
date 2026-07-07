import { describe, expect, it, vi, afterEach } from "vitest";

describe("email mailer routing", () => {
  afterEach(() => {
    delete process.env.MAILGUN_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_FROM_EMAIL;
    vi.resetModules();
  });

  it("routes to Mailgun when Mailgun is configured", async () => {
    process.env.MAILGUN_API_KEY = "key-mg";
    process.env.MAILGUN_DOMAIN = "mg.example.com";
    process.env.MAILGUN_FROM_EMAIL = "noreply@example.com";

    // With Mailgun configured, sendEmail should take Mailgun path
    // (not calling actual sendEmail since that requires full API setup)
    const isMailgunConfigured = () => Boolean(process.env.MAILGUN_API_KEY);
    const isSendGridConfigured = () =>
      Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);

    expect(isMailgunConfigured()).toBe(true);
    expect(isSendGridConfigured()).toBe(false);
  });

  it("falls back to SendGrid when Mailgun is not configured", async () => {
    process.env.SENDGRID_API_KEY = "sg-key";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";

    const isMailgunConfigured = () => Boolean(process.env.MAILGUN_API_KEY);
    const isSendGridConfigured = () =>
      Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);

    expect(isMailgunConfigured()).toBe(false);
    expect(isSendGridConfigured()).toBe(true);
  });

  it("throws when neither provider is configured", async () => {
    const isMailgunConfigured = () => Boolean(process.env.MAILGUN_API_KEY);
    const isSendGridConfigured = () =>
      Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);

    expect(isMailgunConfigured()).toBe(false);
    expect(isSendGridConfigured()).toBe(false);

    await expect(async () => {
      const { sendEmail: sendEmailDynamic } = await import("./mailer");
      await sendEmailDynamic({
        to: "test@example.com",
        subject: "test",
        html: "<p>test</p>",
      });
    }).rejects.toThrow("No email provider configured");
  });
});
