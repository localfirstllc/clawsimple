CREATE TABLE "official_telegram_events" (
	"id" text PRIMARY KEY NOT NULL,
	"telegram_user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" integer,
	"user_id" text,
	"sid" text,
	"job_id" text,
	"raw_text" text NOT NULL,
	"parsed_command" text,
	"mapped_command" text,
	"routing_outcome" text NOT NULL,
	"reply_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "official_telegram_events" ADD CONSTRAINT "official_telegram_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_telegram_events" ADD CONSTRAINT "official_telegram_events_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_telegram_events" ADD CONSTRAINT "official_telegram_events_job_id_deployment_agent_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."deployment_agent_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "official_telegram_events_created_idx" ON "official_telegram_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "official_telegram_events_user_created_idx" ON "official_telegram_events" USING btree ("telegram_user_id","created_at");--> statement-breakpoint
CREATE INDEX "official_telegram_events_outcome_created_idx" ON "official_telegram_events" USING btree ("routing_outcome","created_at");--> statement-breakpoint
CREATE INDEX "official_telegram_events_sid_created_idx" ON "official_telegram_events" USING btree ("sid","created_at");