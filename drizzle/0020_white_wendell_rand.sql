ALTER TABLE "deploy_preset_usage_seat_daily" ADD COLUMN "seat_id" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "seat_id" text;--> statement-breakpoint
ALTER TABLE "deploy_preset_usage_seat_daily" ADD CONSTRAINT "deploy_preset_usage_seat_daily_seat_day_uniq" UNIQUE("seat_id","day");