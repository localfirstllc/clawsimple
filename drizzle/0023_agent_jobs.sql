ALTER TABLE "deployment_skills" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "deployment_skills" CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_skill_jobs" RENAME TO "deployment_agent_jobs";--> statement-breakpoint
ALTER TABLE "deployment_skill_wake" RENAME TO "deployment_agent_wake";--> statement-breakpoint
ALTER TABLE "deployment_agent_jobs" DROP CONSTRAINT "deployment_skill_jobs_sid_install_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "deployment_agent_jobs" DROP CONSTRAINT "deployment_skill_jobs_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "deployment_agent_wake" DROP CONSTRAINT "deployment_skill_wake_sid_install_sessions_id_fk";
--> statement-breakpoint
DROP INDEX "deployment_skill_jobs_sid_status_idx";--> statement-breakpoint
DROP INDEX "deployment_skill_jobs_sid_updated_idx";--> statement-breakpoint
DROP INDEX "deployment_skill_jobs_user_idx";--> statement-breakpoint
DROP INDEX "deployment_skill_wake_updated_idx";--> statement-breakpoint
ALTER TABLE "deployment_agent_jobs" ADD COLUMN "job_type" text;--> statement-breakpoint
ALTER TABLE "deployment_agent_jobs" ADD COLUMN "payload" json;--> statement-breakpoint
ALTER TABLE "deployment_agent_jobs" ADD CONSTRAINT "deployment_agent_jobs_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_agent_jobs" ADD CONSTRAINT "deployment_agent_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_agent_wake" ADD CONSTRAINT "deployment_agent_wake_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_agent_jobs_sid_status_idx" ON "deployment_agent_jobs" USING btree ("sid","status");--> statement-breakpoint
CREATE INDEX "deployment_agent_jobs_sid_updated_idx" ON "deployment_agent_jobs" USING btree ("sid","updated_at");--> statement-breakpoint
CREATE INDEX "deployment_agent_jobs_user_idx" ON "deployment_agent_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deployment_agent_wake_updated_idx" ON "deployment_agent_wake" USING btree ("updated_at");--> statement-breakpoint
UPDATE "deployment_agent_jobs"
SET
  "job_type" = COALESCE("job_type", 'install_skill'),
  "payload" = COALESCE(
    "payload",
    json_build_object(
      'slug',
      "slug",
      'source_url',
      "source_url"
    )
  );--> statement-breakpoint
ALTER TABLE "deployment_agent_jobs" ALTER COLUMN "job_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_agent_jobs" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "deployment_agent_jobs" DROP COLUMN "source_url";
