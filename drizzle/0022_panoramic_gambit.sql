ALTER TABLE "install_sessions" ADD COLUMN "pending_seat_plan" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "pending_seat_effective_at" timestamp;