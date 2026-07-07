CREATE TYPE "public"."deployment_skill_install_status" AS ENUM('pending', 'installing', 'installed', 'failed', 'removing');--> statement-breakpoint
CREATE TABLE "deployment_skill_installs" (
	"id" text PRIMARY KEY NOT NULL,
	"sid" text NOT NULL,
	"agent_id" text NOT NULL,
	"source_type" "skills_catalog_source" DEFAULT 'clawhub' NOT NULL,
	"source_owner" text,
	"source_slug" text,
	"source_url" text,
	"display_name" text,
	"status" "deployment_skill_install_status" DEFAULT 'pending' NOT NULL,
	"install_path" text,
	"installed_version" text,
	"error_message" text,
	"job_id" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"installed_at" timestamp,
	CONSTRAINT "deployment_skill_installs_sid_agent_source_unique" UNIQUE("sid","agent_id","source_type","source_owner","source_slug")
);
--> statement-breakpoint
ALTER TABLE "deployment_skill_installs" ADD CONSTRAINT "deployment_skill_installs_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_skill_installs" ADD CONSTRAINT "deployment_skill_installs_job_id_deployment_agent_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."deployment_agent_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_skill_installs" ADD CONSTRAINT "deployment_skill_installs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_skill_installs_sid_agent_status_idx" ON "deployment_skill_installs" USING btree ("sid","agent_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "deployment_skill_installs_source_idx" ON "deployment_skill_installs" USING btree ("source_type","source_owner","source_slug");