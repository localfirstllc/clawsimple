CREATE TABLE "billing_customer_cache" (
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customer_cache_user_customer_pk" PRIMARY KEY("user_id","stripe_customer_id")
);
--> statement-breakpoint
CREATE INDEX "billing_customer_cache_customer_id_idx" ON "billing_customer_cache" ("stripe_customer_id");
--> statement-breakpoint
ALTER TABLE "billing_customer_cache" ADD CONSTRAINT "billing_customer_cache_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "billing_subscription" (
	"stripe_subscription_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"status" text NOT NULL,
	"stripe_created_at" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancel_at" timestamp,
	"canceled_at" timestamp,
	"ended_at" timestamp,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "billing_subscription_user_id_idx" ON "billing_subscription" ("user_id");
--> statement-breakpoint
CREATE INDEX "billing_subscription_customer_id_idx" ON "billing_subscription" ("stripe_customer_id");
--> statement-breakpoint
ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "billing_subscription_item" (
	"stripe_subscription_item_id" text PRIMARY KEY NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"status" text NOT NULL,
	"subscription_created_at" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancel_at" timestamp,
	"price_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"archived_at" timestamp,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "billing_subscription_item_user_id_idx" ON "billing_subscription_item" ("user_id");
--> statement-breakpoint
CREATE INDEX "billing_subscription_item_customer_id_idx" ON "billing_subscription_item" ("stripe_customer_id");
--> statement-breakpoint
CREATE INDEX "billing_subscription_item_price_id_idx" ON "billing_subscription_item" ("price_id");
--> statement-breakpoint
CREATE INDEX "billing_subscription_item_user_archived_idx" ON "billing_subscription_item" ("user_id","archived_at");
--> statement-breakpoint
ALTER TABLE "billing_subscription_item" ADD CONSTRAINT "billing_subscription_item_subscription_id_fk" FOREIGN KEY ("stripe_subscription_id") REFERENCES "public"."billing_subscription"("stripe_subscription_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_subscription_item" ADD CONSTRAINT "billing_subscription_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
