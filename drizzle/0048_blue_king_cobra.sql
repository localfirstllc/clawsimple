CREATE TABLE "managed_search_crawl_usage_seat_daily" (
	"sid" text NOT NULL,
	"seat_id" text,
	"subscription_item_id" text NOT NULL,
	"day" date NOT NULL,
	"user_id" text,
	"seat_plan" text NOT NULL,
	"source" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"provider_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"cost_estimated_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "managed_search_crawl_usage_seat_daily_sid_day_uniq" UNIQUE("sid","day"),
	CONSTRAINT "managed_search_crawl_usage_seat_daily_seat_day_uniq" UNIQUE("seat_id","day")
);
--> statement-breakpoint
ALTER TABLE "managed_search_crawl_usage_seat_daily" ADD CONSTRAINT "managed_search_crawl_usage_seat_daily_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_search_crawl_usage_seat_daily" ADD CONSTRAINT "managed_search_crawl_usage_seat_daily_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;