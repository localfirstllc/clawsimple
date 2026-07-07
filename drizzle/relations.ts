import { relations } from "drizzle-orm/relations";
import { featureRequest, featureVote, user, account, session, installSessions, deployPresetUsageDaily, emailUnsubscribe, billingSubscription, billingSubscriptionItem, billingCustomerCache } from "@/lib/db/schema";

export const featureVoteRelations = relations(featureVote, ({one}) => ({
	featureRequest: one(featureRequest, {
		fields: [featureVote.featureId],
		references: [featureRequest.id]
	}),
	user: one(user, {
		fields: [featureVote.userId],
		references: [user.id]
	}),
}));

export const featureRequestRelations = relations(featureRequest, ({one, many}) => ({
	featureVotes: many(featureVote),
	user: one(user, {
		fields: [featureRequest.submittedBy],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	featureVotes: many(featureVote),
	accounts: many(account),
	sessions: many(session),
	featureRequests: many(featureRequest),
	installSessions: many(installSessions),
	deployPresetUsageDailies: many(deployPresetUsageDaily),
	emailUnsubscribes: many(emailUnsubscribe),
	billingSubscriptions: many(billingSubscription),
	billingSubscriptionItems: many(billingSubscriptionItem),
	billingCustomerCaches: many(billingCustomerCache),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const installSessionsRelations = relations(installSessions, ({one}) => ({
	user: one(user, {
		fields: [installSessions.userId],
		references: [user.id]
	}),
}));

export const deployPresetUsageDailyRelations = relations(deployPresetUsageDaily, ({one}) => ({
	user: one(user, {
		fields: [deployPresetUsageDaily.userId],
		references: [user.id]
	}),
}));

export const emailUnsubscribeRelations = relations(emailUnsubscribe, ({one}) => ({
	user: one(user, {
		fields: [emailUnsubscribe.userId],
		references: [user.id]
	}),
}));

export const billingSubscriptionRelations = relations(billingSubscription, ({one, many}) => ({
	user: one(user, {
		fields: [billingSubscription.userId],
		references: [user.id]
	}),
	billingSubscriptionItems: many(billingSubscriptionItem),
}));

export const billingSubscriptionItemRelations = relations(billingSubscriptionItem, ({one}) => ({
	billingSubscription: one(billingSubscription, {
		fields: [billingSubscriptionItem.stripeSubscriptionId],
		references: [billingSubscription.stripeSubscriptionId]
	}),
	user: one(user, {
		fields: [billingSubscriptionItem.userId],
		references: [user.id]
	}),
}));

export const billingCustomerCacheRelations = relations(billingCustomerCache, ({one}) => ({
	user: one(user, {
		fields: [billingCustomerCache.userId],
		references: [user.id]
	}),
}));