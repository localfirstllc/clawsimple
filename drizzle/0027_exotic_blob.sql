CREATE TABLE "deployment_agent_job_secrets" (
	"job_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_sid" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"object_key" text,
	"size_bytes" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment_agent_job_secrets" ADD CONSTRAINT "deployment_agent_job_secrets_job_id_deployment_agent_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."deployment_agent_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_backups" ADD CONSTRAINT "deployment_backups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_backups" ADD CONSTRAINT "deployment_backups_source_sid_install_sessions_id_fk" FOREIGN KEY ("source_sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_backups_user_created_idx" ON "deployment_backups" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "deployment_backups_source_sid_idx" ON "deployment_backups" USING btree ("source_sid");