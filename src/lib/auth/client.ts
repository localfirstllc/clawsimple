import { createAuthClient, InferAuth } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";
import { stripeClient } from "@better-auth/stripe/client";

export const authClient = createAuthClient({
  // Type-only: helps the client infer additional user fields (e.g. `role`) from server config.
  $InferAuth: InferAuth<typeof import("./config")["auth"]>(),
  plugins: [magicLinkClient(), stripeClient({ subscription: true })],
});
