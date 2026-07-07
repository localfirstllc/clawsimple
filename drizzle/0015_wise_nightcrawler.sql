ALTER TABLE "feature_request" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_request" ADD COLUMN "release_date" timestamp;--> statement-breakpoint
ALTER TABLE "feature_request" ADD COLUMN "release_note" text;--> statement-breakpoint
ALTER TABLE "feature_request" ADD COLUMN "requires_redeploy" boolean DEFAULT false NOT NULL;