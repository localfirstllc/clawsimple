CREATE TABLE "deployment_skill_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"sid" text NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_skill_wake" (
	"sid" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_skills" (
	"sid" text NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'installed' NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_skills_sid_slug_pk" PRIMARY KEY("sid","slug")
);
--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "deploy_agent_token_hash" text;--> statement-breakpoint
ALTER TABLE "deployment_skill_jobs" ADD CONSTRAINT "deployment_skill_jobs_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_skill_jobs" ADD CONSTRAINT "deployment_skill_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_skill_wake" ADD CONSTRAINT "deployment_skill_wake_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_skills" ADD CONSTRAINT "deployment_skills_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_skills" ADD CONSTRAINT "deployment_skills_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_skill_jobs_sid_status_idx" ON "deployment_skill_jobs" USING btree ("sid","status");--> statement-breakpoint
CREATE INDEX "deployment_skill_jobs_sid_updated_idx" ON "deployment_skill_jobs" USING btree ("sid","updated_at");--> statement-breakpoint
CREATE INDEX "deployment_skill_jobs_user_idx" ON "deployment_skill_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deployment_skill_wake_updated_idx" ON "deployment_skill_wake" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "deployment_skills_sid_idx" ON "deployment_skills" USING btree ("sid");--> statement-breakpoint
CREATE INDEX "deployment_skills_user_idx" ON "deployment_skills" USING btree ("user_id");