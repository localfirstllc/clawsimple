CREATE TABLE "deployment_codex_auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"sid" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"authorization_url" text,
	"connected_account_id" text,
	"email" text,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment_codex_auth_sessions" ADD CONSTRAINT "deployment_codex_auth_sessions_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_codex_auth_sessions" ADD CONSTRAINT "deployment_codex_auth_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_codex_auth_sessions_sid_status_idx" ON "deployment_codex_auth_sessions" USING btree ("sid","status","updated_at");--> statement-breakpoint
CREATE INDEX "deployment_codex_auth_sessions_user_idx" ON "deployment_codex_auth_sessions" USING btree ("user_id");