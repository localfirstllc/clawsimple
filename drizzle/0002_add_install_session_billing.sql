ALTER TABLE "install_sessions" ADD COLUMN "active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "seat_status" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "seat_plan" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "stripe_subscription_item_id" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "stripe_invoice_id" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "grace_until" timestamp;