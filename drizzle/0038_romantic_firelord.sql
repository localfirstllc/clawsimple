ALTER TABLE "install_sessions" ADD COLUMN "codex_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "codex_install_status" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "codex_auth_status" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "codex_runtime_status" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "codex_last_check_at" timestamp;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "codex_error_message" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "codex_connected_account_id" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "codex_credential_ref" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "codex_config_version" integer DEFAULT 0 NOT NULL;