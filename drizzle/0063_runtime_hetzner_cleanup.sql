CREATE TABLE "telegram_bot_token_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"sid" text NOT NULL,
	"agent_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
DROP TABLE "deployment_skill_installs" CASCADE;--> statement-breakpoint
DROP TABLE "official_telegram_events" CASCADE;--> statement-breakpoint
DROP TABLE "server_pool" CASCADE;--> statement-breakpoint
DROP TABLE "skills_catalog_items" CASCADE;--> statement-breakpoint
DROP TABLE "telegram_conversation_state" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_catalog_items" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_catalog_skill_links" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_metrics" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_verification" CASCADE;--> statement-breakpoint
ALTER TABLE "telegram_bot_token_assignments" ADD CONSTRAINT "telegram_bot_token_assignments_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_bot_token_assignments_active_token_uniq" ON "telegram_bot_token_assignments" USING btree ("token_hash") WHERE "telegram_bot_token_assignments"."active" = true;--> statement-breakpoint
CREATE INDEX "telegram_bot_token_assignments_sid_agent_idx" ON "telegram_bot_token_assignments" USING btree ("sid","agent_id","active");--> statement-breakpoint
DROP TYPE "public"."deployment_skill_install_status";--> statement-breakpoint
DROP TYPE "public"."skills_catalog_source";--> statement-breakpoint
DROP TYPE "public"."workflow_difficulty";--> statement-breakpoint
DROP TYPE "public"."workflow_prompt_determinism";--> statement-breakpoint
DROP TYPE "public"."workflow_verification_status";