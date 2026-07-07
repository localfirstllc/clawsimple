ALTER TABLE "install_sessions" ADD COLUMN "mailgun_inbox_address" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "mailgun_domain" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "mailgun_agent_id" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "mailgun_telegram_target" text;