CREATE TYPE "public"."skills_catalog_source" AS ENUM('clawhub', 'manual');--> statement-breakpoint
CREATE TABLE "skills_catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"source_type" "skills_catalog_source" DEFAULT 'clawhub' NOT NULL,
	"source_owner" text,
	"source_slug" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skills_catalog_items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "skills_catalog_items_source_unique" UNIQUE("source_type","source_owner","source_slug")
);
--> statement-breakpoint
CREATE INDEX "skills_catalog_items_visible_sort_idx" ON "skills_catalog_items" USING btree ("is_visible","is_active","is_featured","sort_order","created_at");