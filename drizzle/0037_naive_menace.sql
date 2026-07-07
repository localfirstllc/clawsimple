CREATE TYPE "public"."content_video_surface" AS ENUM('home_openclaw', 'deploy_clawsimple');--> statement-breakpoint
CREATE TABLE "content_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"surface" "content_video_surface" NOT NULL,
	"youtube_video_id" text NOT NULL,
	"title" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_videos_surface_sort_idx" ON "content_videos" USING btree ("surface","is_active","sort_order","created_at");