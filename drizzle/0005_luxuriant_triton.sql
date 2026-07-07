CREATE TYPE "public"."feature_category" AS ENUM('core', 'integration', 'ui', 'billing', 'other');--> statement-breakpoint
CREATE TYPE "public"."feature_status" AS ENUM('considering', 'planned', 'in-progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."vote_intensity" AS ENUM('want', 'need');--> statement-breakpoint
CREATE TABLE "feature_request" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "feature_status" DEFAULT 'considering' NOT NULL,
	"category" "feature_category" DEFAULT 'other' NOT NULL,
	"submitted_by" text,
	"is_paid_user" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_vote" (
	"id" text PRIMARY KEY NOT NULL,
	"feature_id" text NOT NULL,
	"user_id" text NOT NULL,
	"intensity" "vote_intensity" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_vote_feature_id_user_id_unique" UNIQUE("feature_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "feature_request" ADD CONSTRAINT "feature_request_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_vote" ADD CONSTRAINT "feature_vote_feature_id_feature_request_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."feature_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_vote" ADD CONSTRAINT "feature_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;