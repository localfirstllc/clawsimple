import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

type StripeCustomerRow = {
  stripeCustomerId: string | null;
  email: string;
  name: string | null;
};

let stripeClient: Stripe | null = null;

function requireStripeSecret() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return secret;
}

export function getStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(requireStripeSecret());
  }
  return stripeClient;
}

export function getGraceMinutes() {
  const raw = process.env.GRACE_MINUTES_DEFAULT;
  const parsed = raw ? Number(raw) : 60;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

async function getStripeCustomerRow(userId: string): Promise<StripeCustomerRow | null> {
  const rows = await db
    .select({
      stripeCustomerId: user.stripeCustomerId,
      email: user.email,
      name: user.name,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getStripeCustomerId(userId: string) {
  const row = await getStripeCustomerRow(userId);
  return row?.stripeCustomerId ?? null;
}

export async function ensureStripeCustomerId(userId: string) {
  const stripe = getStripeClient();
  const row = await getStripeCustomerRow(userId);
  if (!row) {
    throw new Error("user not found");
  }
  if (row.stripeCustomerId) {
    return row.stripeCustomerId;
  }
  const customer = await stripe.customers.create({
    email: row.email,
    name: row.name ?? undefined,
  });
  await db
    .update(user)
    .set({ stripeCustomerId: customer.id })
    .where(eq(user.id, userId));
  return customer.id;
}

export async function hasDefaultPaymentMethod(customerId: string) {
  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    return false;
  }
  const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;
  if (defaultPaymentMethod) {
    return true;
  }

  // Some subscriptions (for example paid with Link) store default payment
  // method on subscription instead of customer. Backfill customer default.
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });
  const eligible = subscriptions.data
    .filter((sub) =>
      ["active", "trialing", "past_due", "incomplete"].includes(sub.status)
    )
    .sort((a, b) => b.created - a.created);
  const subscriptionDefault = eligible.find((sub) => sub.default_payment_method)
    ?.default_payment_method;
  const subscriptionDefaultId =
    typeof subscriptionDefault === "string"
      ? subscriptionDefault
      : subscriptionDefault?.id;
  if (subscriptionDefaultId) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: subscriptionDefaultId },
    });
    return true;
  }

  const paymentMethodTypes: Stripe.PaymentMethodListParams.Type[] = [
    "card",
    "link",
  ];
  for (const type of paymentMethodTypes) {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type,
      limit: 1,
    });
    if (paymentMethods.data.length === 0) {
      continue;
    }
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethods.data[0].id },
    });
    return true;
  }

  return false;
}

export async function setCustomerDefaultPaymentMethod(params: {
  customerId: string;
  paymentMethodId: string;
}) {
  const stripe = getStripeClient();
  await stripe.customers.update(params.customerId, {
    invoice_settings: { default_payment_method: params.paymentMethodId },
  });
}

export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}) {
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  return session.url;
}

export type SeatChargeResult = {
  paid: boolean;
  subscriptionId: string;
  subscriptionItemId: string;
  invoiceId: string | null;
  invoiceStatus: string | null;
  paymentIntentStatus: string | null;
};

export type SeatSubscriptionSnapshot = SeatChargeResult & {
  quantity: number;
  status: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  endedAt: Date | null;
};

type StripeInvoiceWithPaymentIntent = Stripe.Invoice & {
  payment_intent?: Stripe.PaymentIntent | string | null;
};

type StripeSubscriptionWithInvoice = Stripe.Subscription & {
  latest_invoice?: StripeInvoiceWithPaymentIntent | string | null;
};

function extractInvoice(subscription: StripeSubscriptionWithInvoice) {
  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice === "string") return null;
  return invoice;
}

function toDate(seconds?: number | null) {
  if (!seconds) return null;
  return new Date(seconds * 1000);
}

function parseSeatCharge(
  subscription: StripeSubscriptionWithInvoice,
  subscriptionItemId: string
): SeatChargeResult {
  const invoice = extractInvoice(subscription);
  const paymentIntent = invoice?.payment_intent;
  const paymentIntentStatus =
    paymentIntent && typeof paymentIntent !== "string"
      ? paymentIntent.status
      : null;
  const paid = invoice?.status === "paid" || paymentIntentStatus === "succeeded";

  return {
    paid,
    subscriptionId: subscription.id,
    subscriptionItemId,
    invoiceId: invoice?.id ?? null,
    invoiceStatus: invoice?.status ?? null,
    paymentIntentStatus,
  };
}

type SeatSubscriptionMatch = {
  subscription: StripeSubscriptionWithInvoice;
  item: Stripe.SubscriptionItem;
};

async function findSeatSubscription(params: {
  customerId: string;
  priceId?: string;
  priceIds?: string[];
  subscriptionItemId?: string;
}): Promise<SeatSubscriptionMatch | null> {
  const stripe = getStripeClient();
  const allowedPriceIds = new Set(
    (params.priceIds && params.priceIds.length > 0
      ? params.priceIds
      : params.priceId
        ? [params.priceId]
        : []
    )
      .map((id) => id.trim())
      .filter(Boolean)
  );
  if (allowedPriceIds.size === 0) {
    return null;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: params.customerId,
    status: "all",
    expand: ["data.latest_invoice.payment_intent", "data.items.data.price"],
  });
  const eligibleStatuses = new Set([
    "active",
    "trialing",
    "past_due",
    "incomplete",
  ]);
  const candidates = subscriptions.data.filter(
    (sub) =>
      eligibleStatuses.has(sub.status) &&
      sub.items.data.some((item) => allowedPriceIds.has(item.price.id))
  );
  if (params.subscriptionItemId) {
    for (const sub of candidates) {
      const item = sub.items.data.find(
        (entry) =>
          entry.id === params.subscriptionItemId &&
          allowedPriceIds.has(entry.price.id)
      );
      if (item) {
        return { subscription: sub as StripeSubscriptionWithInvoice, item };
      }
    }
    return null;
  }
  const existing = candidates.sort((a, b) => b.created - a.created)[0];
  if (!existing) {
    return null;
  }
  const item = existing.items.data.find(
    (entry) => allowedPriceIds.has(entry.price.id)
  );
  if (!item) {
    return null;
  }
  return { subscription: existing as StripeSubscriptionWithInvoice, item };
}

export async function getSeatSubscriptionSnapshot(params: {
  customerId: string;
  priceId?: string;
  priceIds?: string[];
  subscriptionItemId?: string;
}): Promise<SeatSubscriptionSnapshot | null> {
  const match = await findSeatSubscription(params);
  if (!match) {
    return null;
  }
  const parsed = parseSeatCharge(match.subscription, match.item.id);
  return {
    ...parsed,
    quantity: match.item.quantity ?? 0,
    status: match.subscription.status,
    cancelAtPeriodEnd: Boolean(match.subscription.cancel_at_period_end),
    cancelAt: toDate(match.subscription.cancel_at),
    currentPeriodStart: toDate(match.item.current_period_start),
    currentPeriodEnd: toDate(match.item.current_period_end),
    endedAt: toDate(match.subscription.ended_at),
  };
}

export async function findActivePromoCode(code: string) {
  const stripe = getStripeClient();
  const promos = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
    expand: ["data.promotion.coupon"],
  });
  return promos.data[0] ?? null;
}

export async function addSeatToSubscription(params: {
  customerId: string;
  priceId: string;
  priceIds?: string[];
  promotionCodeId?: string;
  subscriptionItemId?: string;
}) {
  const stripe = getStripeClient();
  const match = await findSeatSubscription({
    customerId: params.customerId,
    priceIds: params.priceIds,
    priceId: params.priceId,
    subscriptionItemId: params.subscriptionItemId,
  });

  if (match) {
    const { subscription: existing, item } = match;
    const updateParams: Stripe.SubscriptionUpdateParams = {
      items: [
        {
          id: item.id,
          quantity: (item.quantity ?? 0) + 1,
        },
      ],
      proration_behavior: "always_invoice",
      expand: ["latest_invoice.payment_intent"],
    };

    if (params.promotionCodeId) {
      updateParams.discounts = [{ promotion_code: params.promotionCodeId }];
    }

    const updated = (await stripe.subscriptions.update(
      existing.id,
      updateParams
    )) as StripeSubscriptionWithInvoice;
    return parseSeatCharge(updated, item.id);
  }

  const createParams: Stripe.SubscriptionCreateParams = {
    customer: params.customerId,
    items: [{ price: params.priceId, quantity: 1 }],
    expand: ["latest_invoice.payment_intent"],
  };

  if (params.promotionCodeId) {
    createParams.discounts = [{ promotion_code: params.promotionCodeId }];
  }

  console.log("Creating subscription with params:", JSON.stringify(createParams, null, 2));

  try {
    const created = (await stripe.subscriptions.create(
      createParams
    )) as StripeSubscriptionWithInvoice;
    
    console.log("Subscription created successfully:", created.id);
    
    const item = created.items.data.find(
      (entry) => entry.price.id === params.priceId
    );
    if (!item) {
      throw new Error("subscription item not found for new subscription");
    }
    return parseSeatCharge(created, item.id);
  } catch (error) {
    console.error("Failed to create subscription:", error);
    throw error;
  }
}

export async function removeSeatFromSubscription(params: {
  subscriptionId: string;
  subscriptionItemId: string;
}) {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
  const item = subscription.items.data.find(
    (entry) => entry.id === params.subscriptionItemId
  );
  if (!item) {
    return;
  }
  if ((item.quantity ?? 0) <= 1) {
    const isLastItem = subscription.items.data.length === 1;
    if (isLastItem) {
      await stripe.subscriptions.cancel(params.subscriptionId);
    } else {
      await stripe.subscriptions.update(params.subscriptionId, {
        items: [{ id: item.id, deleted: true }],
        proration_behavior: "none",
      });
    }
    return;
  }
  await stripe.subscriptions.update(params.subscriptionId, {
    items: [{ id: item.id, quantity: (item.quantity ?? 1) - 1 }],
    proration_behavior: "none",
  });
}

export async function voidInvoice(invoiceId: string) {
  const stripe = getStripeClient();
  await stripe.invoices.voidInvoice(invoiceId);
}

export async function getSubscriptionPeriodEnd(params: {
  subscriptionId: string;
  subscriptionItemId: string;
}) {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(
    params.subscriptionId
  );
  const item = subscription.items.data.find(
    (entry) => entry.id === params.subscriptionItemId
  );
  if (!item) {
    throw new Error("subscription item not found for period end");
  }
  return new Date(item.current_period_end * 1000);
}

type SeatRemovalScheduleResult = {
  action: "created" | "updated" | "released" | "canceled" | "noop";
  scheduleId: string | null;
  currentPeriodEnd: Date;
  nextQuantity: number;
};

type SeatPlanChangeScheduleResult = {
  action: "created" | "updated" | "released" | "noop";
  scheduleId: string | null;
  currentPeriodEnd: Date;
};

function getPriceId(price: Stripe.SubscriptionItem["price"]) {
  return typeof price === "string" ? price : price.id;
}

function buildPhaseItems(
  items: Stripe.SubscriptionItem[],
  overrides?: Map<string, number>
) {
  return items.map((item) => ({
    price: getPriceId(item.price),
    quantity: overrides?.get(item.id) ?? item.quantity ?? 0,
  }));
}

async function resolveSubscriptionSchedule(
  stripe: Stripe,
  schedule: Stripe.Subscription["schedule"]
): Promise<Stripe.SubscriptionSchedule | null> {
  if (!schedule) return null;
  // The expanded `subscription.schedule` object can be incomplete depending on API version/expansion.
  // Always retrieve it to ensure `phases` are present.
  const scheduleId = typeof schedule === "string" ? schedule : schedule.id;
  return await stripe.subscriptionSchedules.retrieve(scheduleId);
}

export async function upsertSeatRemovalSchedule(params: {
  subscriptionId: string;
  subscriptionItemId: string;
  pendingCount: number;
}): Promise<SeatRemovalScheduleResult> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(
    params.subscriptionId,
    {
      expand: ["items.data.price", "schedule"],
    }
  );

  const item = subscription.items.data.find(
    (entry) => entry.id === params.subscriptionItemId
  );
  if (!item) {
    throw new Error("subscription item not found");
  }

  let schedule = await resolveSubscriptionSchedule(stripe, subscription.schedule);
  if (schedule?.metadata?.managed_by && schedule.metadata.managed_by !== "seat_removal") {
    throw new Error("subscription schedule is managed externally");
  }
  if (!schedule?.metadata?.managed_by && schedule?.phases?.length && schedule.phases.length > 1) {
    throw new Error("subscription schedule has existing phases");
  }
  if (schedule?.status && schedule.status !== "active") {
    // If this is our previously released schedule, treat it as absent.
    if (schedule.metadata?.managed_by === "seat_removal") {
      schedule = null;
    } else {
      throw new Error("subscription schedule is not active");
    }
  }

  // If there's a phase mismatch on a managed schedule, release it and start fresh
  if (schedule?.phases?.length && schedule.metadata?.managed_by === "seat_removal") {
    const expectedEnd = schedule.current_phase?.end_date;
    const lastPhase = schedule.phases[schedule.phases.length - 1];
    if (expectedEnd && lastPhase?.start_date && lastPhase.start_date !== expectedEnd) {
      // Release the problematic schedule so we can create a new one
      await stripe.subscriptionSchedules.release(schedule.id);
      schedule = null;
    }
  }

  // Stripe's Subscription object no longer exposes current_period_* in newer API versions,
  // but SubscriptionItem still includes them.
  const subscriptionPeriodStart = item.current_period_start ?? null;
  const subscriptionPeriodEnd = item.current_period_end ?? null;
  if (subscriptionPeriodEnd == null) {
    throw new Error("unable to resolve subscription period end");
  }

  const currentPeriodEnd = new Date(subscriptionPeriodEnd * 1000);
  const currentQuantity = item.quantity ?? 0;
  const nextQuantity = Math.max(0, currentQuantity - params.pendingCount);

  if (params.pendingCount <= 0) {
    const clearCancellationFlags = async () => {
      // Stripe rejects updates that include both cancel_at_period_end and cancel_at.
      // Clear them in two steps to avoid the conflict.
      let updated = await stripe.subscriptions.update(params.subscriptionId, {
        cancel_at: null,
      });
      if (updated.cancel_at_period_end) {
        updated = await stripe.subscriptions.update(params.subscriptionId, {
          cancel_at_period_end: false,
        });
      }
      return updated;
    };

    if (schedule && schedule.metadata?.managed_by === "seat_removal") {
      await stripe.subscriptionSchedules.release(schedule.id);
      await clearCancellationFlags();

      return {
        action: "released",
        scheduleId: schedule.id,
        currentPeriodEnd,
        nextQuantity: currentQuantity,
      };
    }

    // Even if the schedule is already absent (released elsewhere), the subscription-level
    // cancellation flags can remain set. Clear them to ensure "Undo" restores renewal.
    await clearCancellationFlags();

    return {
      action: "noop",
      scheduleId: schedule?.id ?? null,
      currentPeriodEnd,
      nextQuantity: currentQuantity,
    };
  }

  let activeSchedule = schedule;
  
  if (!activeSchedule) {
    activeSchedule = await stripe.subscriptionSchedules.create({
      from_subscription: params.subscriptionId,
    });
    // Set metadata after creation since from_subscription doesn't allow it
    activeSchedule = await stripe.subscriptionSchedules.update(activeSchedule.id, {
      metadata: { managed_by: "seat_removal" },
    });
  }

  // Ensure we have full schedule details (`phases` can be absent on partially-expanded objects).
  activeSchedule = await stripe.subscriptionSchedules.retrieve(activeSchedule.id);

  // Stripe schedule `current_phase` can be null, so fall back to the first phase.
  const anchoredPhaseStart =
    activeSchedule.current_phase?.start_date ??
    activeSchedule.phases?.[0]?.start_date ??
    subscriptionPeriodStart;
  const anchoredPhaseEnd =
    activeSchedule.current_phase?.end_date ??
    activeSchedule.phases?.[0]?.end_date ??
    subscriptionPeriodEnd;

  if (anchoredPhaseStart == null || anchoredPhaseEnd == null) {
    console.warn("Seat removal schedule: unable to resolve phase boundaries", {
      subscriptionId: params.subscriptionId,
      subscriptionItemId: params.subscriptionItemId,
      scheduleId: activeSchedule.id,
      scheduleCurrentPhase: activeSchedule.current_phase ?? null,
      schedulePhase0: activeSchedule.phases?.[0]
        ? {
            start_date: activeSchedule.phases[0].start_date ?? null,
            end_date: activeSchedule.phases[0].end_date ?? null,
          }
        : null,
      subscriptionPeriodStart,
      subscriptionPeriodEnd,
    });
    throw new Error("unable to resolve subscription phase boundaries");
  }

  const currentPhaseItems = buildPhaseItems(subscription.items.data);

  if (nextQuantity <= 0) {
    await stripe.subscriptionSchedules.update(activeSchedule.id, {
      end_behavior: "cancel",
      metadata: { managed_by: "seat_removal" },
      phases: [
        {
          items: currentPhaseItems,
          start_date: anchoredPhaseStart,
          end_date: anchoredPhaseEnd,
        },
      ],
      proration_behavior: "none",
    });
    return {
      action: schedule ? "updated" : "created",
      scheduleId: activeSchedule.id,
      currentPeriodEnd: new Date(anchoredPhaseEnd * 1000),
      nextQuantity,
    };
  }

  const phaseDuration = Math.max(1, anchoredPhaseEnd - anchoredPhaseStart);
  const nextPhaseStart = anchoredPhaseEnd;
  const nextPhaseEnd = anchoredPhaseEnd + phaseDuration;

  const overrides = new Map<string, number>([[item.id, nextQuantity]]);
  const nextPhaseItems = buildPhaseItems(subscription.items.data, overrides);

  await stripe.subscriptionSchedules.update(activeSchedule.id, {
    end_behavior: "release",
    metadata: { managed_by: "seat_removal" },
    phases: [
      {
        items: currentPhaseItems,
        start_date: anchoredPhaseStart,
        end_date: anchoredPhaseEnd,
      },
      {
        items: nextPhaseItems,
        start_date: nextPhaseStart,
        end_date: nextPhaseEnd,
        proration_behavior: "none",
      },
    ],
    proration_behavior: "none",
  });

  return {
    action: schedule ? "updated" : "created",
    scheduleId: activeSchedule.id,
    currentPeriodEnd,
    nextQuantity,
  };
}

export async function hasManagedSeatRemovalSchedule(params: {
  subscriptionId: string;
}) {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(params.subscriptionId, {
    expand: ["schedule"],
  });
  const schedule = await resolveSubscriptionSchedule(stripe, subscription.schedule);
  return schedule?.metadata?.managed_by === "seat_removal";
}

export async function upsertSeatPlanChangeSchedule(params: {
  subscriptionId: string;
  desiredChanges: Array<{ sourceItemId: string; targetPriceId: string }>;
}): Promise<SeatPlanChangeScheduleResult> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(params.subscriptionId, {
    expand: ["items.data.price", "schedule"],
  });

  let schedule = await resolveSubscriptionSchedule(stripe, subscription.schedule);
  if (schedule?.metadata?.managed_by && schedule.metadata.managed_by !== "seat_plan_change") {
    throw new Error("subscription schedule is managed externally");
  }
  if (!schedule?.metadata?.managed_by && schedule?.phases?.length && schedule.phases.length > 1) {
    throw new Error("subscription schedule has existing phases");
  }
  if (schedule?.status && schedule.status !== "active") {
    if (schedule.metadata?.managed_by === "seat_plan_change") {
      schedule = null;
    } else {
      throw new Error("subscription schedule is not active");
    }
  }

  const fallbackItem = subscription.items.data[0];
  if (!fallbackItem?.current_period_end) {
    throw new Error("unable to resolve subscription period end");
  }
  const currentPeriodEnd = new Date(fallbackItem.current_period_end * 1000);

  if (params.desiredChanges.length === 0) {
    if (schedule?.metadata?.managed_by === "seat_plan_change") {
      await stripe.subscriptionSchedules.release(schedule.id);
      return {
        action: "released",
        scheduleId: schedule.id,
        currentPeriodEnd,
      };
    }
    return {
      action: "noop",
      scheduleId: schedule?.id ?? null,
      currentPeriodEnd,
    };
  }

  const byItemId = new Map<string, Stripe.SubscriptionItem>();
  for (const item of subscription.items.data) {
    byItemId.set(item.id, item);
  }

  const deltaBySourceItemId = new Map<string, number>();
  const deltaByTargetPriceId = new Map<string, number>();
  for (const change of params.desiredChanges) {
    const sourceItem = byItemId.get(change.sourceItemId);
    if (!sourceItem) {
      throw new Error("source subscription item not found");
    }
    const sourcePriceId = getPriceId(sourceItem.price);
    if (sourcePriceId === change.targetPriceId) {
      continue;
    }
    deltaBySourceItemId.set(
      change.sourceItemId,
      (deltaBySourceItemId.get(change.sourceItemId) ?? 0) - 1
    );
    deltaByTargetPriceId.set(
      change.targetPriceId,
      (deltaByTargetPriceId.get(change.targetPriceId) ?? 0) + 1
    );
  }

  const currentPhaseItems = buildPhaseItems(subscription.items.data);

  const nextByPriceId = new Map<string, number>();
  for (const item of subscription.items.data) {
    nextByPriceId.set(getPriceId(item.price), item.quantity ?? 0);
  }

  for (const [itemId, delta] of deltaBySourceItemId.entries()) {
    const item = byItemId.get(itemId);
    if (!item) continue;
    const priceId = getPriceId(item.price);
    nextByPriceId.set(priceId, Math.max(0, (nextByPriceId.get(priceId) ?? 0) + delta));
  }
  for (const [priceId, delta] of deltaByTargetPriceId.entries()) {
    nextByPriceId.set(priceId, Math.max(0, (nextByPriceId.get(priceId) ?? 0) + delta));
  }

  const nextPhaseItems = Array.from(nextByPriceId.entries())
    .filter(([, quantity]) => quantity > 0)
    .map(([price, quantity]) => ({ price, quantity }));

  if (nextPhaseItems.length === 0) {
    throw new Error("invalid schedule target quantities");
  }

  let activeSchedule = schedule;
  if (!activeSchedule) {
    activeSchedule = await stripe.subscriptionSchedules.create({
      from_subscription: params.subscriptionId,
    });
    activeSchedule = await stripe.subscriptionSchedules.update(activeSchedule.id, {
      metadata: { managed_by: "seat_plan_change" },
    });
  }
  activeSchedule = await stripe.subscriptionSchedules.retrieve(activeSchedule.id);

  const anchoredPhaseStart =
    activeSchedule.current_phase?.start_date ??
    activeSchedule.phases?.[0]?.start_date ??
    fallbackItem.current_period_start ??
    null;
  const anchoredPhaseEnd =
    activeSchedule.current_phase?.end_date ??
    activeSchedule.phases?.[0]?.end_date ??
    fallbackItem.current_period_end ??
    null;
  if (anchoredPhaseStart == null || anchoredPhaseEnd == null) {
    throw new Error("unable to resolve subscription phase boundaries");
  }

  const phaseDuration = Math.max(1, anchoredPhaseEnd - anchoredPhaseStart);
  const nextPhaseStart = anchoredPhaseEnd;
  const nextPhaseEnd = anchoredPhaseEnd + phaseDuration;

  await stripe.subscriptionSchedules.update(activeSchedule.id, {
    end_behavior: "release",
    metadata: { managed_by: "seat_plan_change" },
    phases: [
      {
        items: currentPhaseItems,
        start_date: anchoredPhaseStart,
        end_date: anchoredPhaseEnd,
      },
      {
        items: nextPhaseItems,
        start_date: nextPhaseStart,
        end_date: nextPhaseEnd,
        proration_behavior: "none",
      },
    ],
    proration_behavior: "none",
  });

  return {
    action: schedule ? "updated" : "created",
    scheduleId: activeSchedule.id,
    currentPeriodEnd: new Date(anchoredPhaseEnd * 1000),
  };
}

export async function reduceSeatsFromSubscription(params: {
  subscriptionId: string;
  subscriptionItemId: string;
  count: number;
}) {
  if (params.count <= 0) {
    return;
  }
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
  const item = subscription.items.data.find(
    (entry) => entry.id === params.subscriptionItemId
  );
  if (!item) {
    throw new Error("subscription item not found");
  }
  const currentQuantity = item.quantity ?? 0;
  const nextQuantity = Math.max(0, currentQuantity - params.count);
  if (nextQuantity === 0) {
    const isLastItem = subscription.items.data.length === 1;
    if (isLastItem) {
      await stripe.subscriptions.cancel(params.subscriptionId);
    } else {
      await stripe.subscriptions.update(params.subscriptionId, {
        items: [{ id: item.id, deleted: true }],
        proration_behavior: "none",
      });
    }
    return;
  }
  await stripe.subscriptions.update(params.subscriptionId, {
    items: [{ id: item.id, quantity: nextQuantity }],
    proration_behavior: "none",
  });
}
