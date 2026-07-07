CREATE TABLE "deployment_agent_local_login" (
	"id" text PRIMARY KEY NOT NULL,
	"sid" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_url" text,
	"user_code" text,
	"account_label" text,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_agent_local_state" (
	"sid" text NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"install_status" text,
	"auth_status" text,
	"runtime_status" text,
	"account_label" text,
	"error_message" text,
	"last_check_at" timestamp,
	"config_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_agent_local_state_sid_provider_pk" PRIMARY KEY("sid","provider")
);
--> statement-breakpoint
DROP TABLE "deployment_codex_auth_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "user_provider_connections" CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_agent_local_login" ADD CONSTRAINT "deployment_agent_local_login_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_agent_local_login" ADD CONSTRAINT "deployment_agent_local_login_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_agent_local_state" ADD CONSTRAINT "deployment_agent_local_state_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_local_agent_auth_sessions_sid_provider_status_idx" ON "deployment_agent_local_login" USING btree ("sid","provider","status","updated_at");--> statement-breakpoint
CREATE INDEX "deployment_local_agent_auth_sessions_user_idx" ON "deployment_agent_local_login" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deployment_local_agents_sid_provider_idx" ON "deployment_agent_local_state" USING btree ("sid","provider","updated_at");--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "codex_enabled";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "codex_install_status";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "codex_auth_status";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "codex_runtime_status";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "codex_last_check_at";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "codex_error_message";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "codex_connected_account_id";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "codex_credential_ref";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "codex_config_version";