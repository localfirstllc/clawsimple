CREATE TABLE "deploy_preset_usage_seat_daily" (
	"sid" text NOT NULL,
	"subscription_item_id" text NOT NULL,
	"day" date NOT NULL,
	"user_id" text,
	"seat_plan" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"last_model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_preset_usage_seat_daily_sid_day_unique" UNIQUE("sid","day")
);
--> statement-breakpoint
ALTER TABLE "deploy_preset_usage_seat_daily" ADD CONSTRAINT "deploy_preset_usage_seat_daily_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_preset_usage_seat_daily" ADD CONSTRAINT "deploy_preset_usage_seat_daily_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;