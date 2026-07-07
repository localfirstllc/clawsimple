import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { stripe } from "@better-auth/stripe";
import Stripe from "stripe";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/mailer";
import {
  SEAT_PLAN_MAX,
  SEAT_PLAN_STANDARD,
} from "@/lib/billing/plans";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripeSeatPriceId = process.env.STRIPE_SEAT_PRICE_ID;
const stripeSeatPriceIdMax = process.env.STRIPE_SEAT_PRICE_ID_MAX;
const stripeSeatPriceIdYearly = process.env.STRIPE_SEAT_PRICE_ID_YEARLY;
const stripeSeatPriceIdMaxYearly = process.env.STRIPE_SEAT_PRICE_ID_MAX_YEARLY;
const googleClientId =
  process.env.GOOGLE_CLIENT_ID ??
  process.env.BETTER_AUTH_GOOGLE_CLIENT_ID ??
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const googleClientSecret =
  process.env.GOOGLE_CLIENT_SECRET ??
  process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET;
const authSecret =
  process.env.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_DEV_SECRET;
if (!authSecret) {
  throw new Error(
    "BETTER_AUTH_SECRET (recommended) or BETTER_AUTH_DEV_SECRET must be set",
  );
}
const authBaseUrl =
  process.env.BETTER_AUTH_URL ??
  process.env.BETTER_AUTH_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";
const normalizeOrigin = (value?: string | null) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
};
const envTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => normalizeOrigin(origin) ?? origin);
const extraTrustedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.NEXT_PUBLIC_BASE_URL,
].map(normalizeOrigin).filter(Boolean) as string[];
const baseTrustedOrigins = Array.from(
  new Set([...extraTrustedOrigins, ...envTrustedOrigins]),
);

function isSafeDevOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}

const trustedOrigins =
  process.env.NODE_ENV === "production"
    ? baseTrustedOrigins
    : async (request?: Request) => {
        const origins = new Set(baseTrustedOrigins);
        const originHeader = request?.headers.get("origin");
        if (originHeader && isSafeDevOrigin(originHeader)) {
          origins.add(originHeader);
        }
        const referer = request?.headers.get("referer");
        if (referer) {
          try {
            const origin = new URL(referer).origin;
            if (isSafeDevOrigin(origin)) origins.add(origin);
          } catch {
            // Ignore malformed referer.
          }
        }
        return Array.from(origins);
      };

const stripeClient = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

function parseEnvIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,\s]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

const stripePlanEntries: Array<[string, string | undefined]> = [
  [SEAT_PLAN_STANDARD, stripeSeatPriceId],
  [SEAT_PLAN_STANDARD, stripeSeatPriceIdYearly],
  [SEAT_PLAN_MAX, stripeSeatPriceIdMax],
  [SEAT_PLAN_MAX, stripeSeatPriceIdMaxYearly],
];

const stripePlans = stripePlanEntries.flatMap(([name, rawPriceIds]) =>
  parseEnvIdList(rawPriceIds).map((priceId) => ({ name, priceId }))
);

const stripePlugin =
  stripeClient && stripeWebhookSecret && stripePlans.length > 0
    ? stripe({
        stripeClient,
        stripeWebhookSecret,
        subscription: {
          enabled: true,
          plans: stripePlans,
        },
      })
    : null;

export const auth = betterAuth({
  secret: authSecret,
  baseURL: authBaseUrl,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
  user: {
    additionalFields: {
      role: {
        type: "string",
      },
    },
  },
  emailAndPassword: {
    enabled: false,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2 style="margin: 0 0 12px;">Sign in to ClawSimple</h2>
            <p>Click the button below to sign in:</p>
            <p>
              <a
                href="${url}"
                style="display:inline-block;padding:10px 16px;border-radius:999px;background:#171512;color:#f8f5f0;text-decoration:none;"
              >Sign in</a>
            </p>
            <p style="color:#6b6763;font-size:12px;">If you did not request this, you can ignore this email.</p>
          </div>
        `;
        await sendEmail({
          to: email,
          subject: "Sign in to ClawSimple",
          html,
        });
      },
    }),
    ...(stripePlugin ? [stripePlugin] : []),
  ],
});

export type Session = typeof auth.$Infer.Session;
