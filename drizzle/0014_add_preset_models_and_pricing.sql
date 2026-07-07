CREATE TABLE "deploy_preset_models" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"provider" text NOT NULL,
	"tier" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_preset_models_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
CREATE TABLE "deploy_preset_pricing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"seat_plan" text NOT NULL,
	"model_id" text,
	"tier" text,
	"unit_price_usd" numeric(12, 6) NOT NULL,
	"effective_from" timestamp NOT NULL,
	"effective_to" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_preset_pricing_rules_model_rule_uniq" UNIQUE("seat_plan","model_id","effective_from"),
	CONSTRAINT "deploy_preset_pricing_rules_tier_rule_uniq" UNIQUE("seat_plan","tier","effective_from")
);
--> statement-breakpoint
ALTER TABLE "deploy_preset_usage_seat_daily" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "deploy_preset_usage_seat_daily" ADD COLUMN "cost_estimated_usd" numeric(12, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE INDEX "deploy_preset_models_active_sort_idx" ON "deploy_preset_models" USING btree ("is_active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "deploy_preset_pricing_rules_active_plan_time_idx" ON "deploy_preset_pricing_rules" USING btree ("is_active","seat_plan","effective_from");