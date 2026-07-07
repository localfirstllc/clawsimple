CREATE TABLE "deploy_preset_usage_daily" (
	"subscription_item_id" text NOT NULL,
	"day" date NOT NULL,
	"user_id" text,
	"seat_plan" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_preset_usage_daily_subscription_item_id_day_unique" UNIQUE("subscription_item_id","day")
);
--> statement-breakpoint
ALTER TABLE "deploy_preset_usage_daily" ADD CONSTRAINT "deploy_preset_usage_daily_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;