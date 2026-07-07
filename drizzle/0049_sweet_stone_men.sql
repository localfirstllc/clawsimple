CREATE TYPE "public"."workflow_prompt_determinism" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."workflow_verification_status" AS ENUM('unverified', 'passed', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "workflow_metrics" (
	"workflow_slug" text PRIMARY KEY NOT NULL,
	"required_setup_count" integer DEFAULT 0 NOT NULL,
	"official_dependency_coverage" numeric(6, 4) DEFAULT '0' NOT NULL,
	"managed_capability_count" integer DEFAULT 0 NOT NULL,
	"prompt_determinism" "workflow_prompt_determinism" DEFAULT 'low' NOT NULL,
	"first_result_minutes" integer,
	"ranking_score" integer DEFAULT 0 NOT NULL,
	"card_ctr" numeric(8, 4),
	"details_open_rate" numeric(8, 4),
	"start_workflow_rate" numeric(8, 4),
	"deploy_conversion_rate" numeric(8, 4),
	"repeat_run_rate" numeric(8, 4),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_verification" (
	"workflow_slug" text PRIMARY KEY NOT NULL,
	"status" "workflow_verification_status" DEFAULT 'unverified' NOT NULL,
	"last_verified_at" timestamp,
	"first_result_minutes" integer,
	"notes_json" json DEFAULT '[]'::json NOT NULL,
	"blockers_json" json DEFAULT '[]'::json NOT NULL,
	"sample_output_json" json,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "workflow_metrics_ranking_idx" ON "workflow_metrics" USING btree ("ranking_score");--> statement-breakpoint
CREATE INDEX "workflow_metrics_determinism_idx" ON "workflow_metrics" USING btree ("prompt_determinism");--> statement-breakpoint
CREATE INDEX "workflow_verification_status_idx" ON "workflow_verification" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_verification_verified_at_idx" ON "workflow_verification" USING btree ("last_verified_at");