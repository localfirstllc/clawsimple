ALTER TABLE "deploy_preset_usage_seat_daily" ADD COLUMN "prompt_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deploy_preset_usage_seat_daily" ADD COLUMN "completion_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deploy_preset_usage_seat_daily" ADD COLUMN "total_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deploy_preset_usage_seat_daily" ADD COLUMN "provider_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL;