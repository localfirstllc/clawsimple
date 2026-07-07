CREATE TYPE "public"."workflow_difficulty" AS ENUM('instant', 'guided', 'advanced');--> statement-breakpoint
CREATE TABLE "workflow_catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"difficulty" "workflow_difficulty" DEFAULT 'guided' NOT NULL,
	"category_i18n" json DEFAULT '{}'::json NOT NULL,
	"title_i18n" json DEFAULT '{}'::json NOT NULL,
	"summary_i18n" json DEFAULT '{}'::json NOT NULL,
	"outcome_i18n" json DEFAULT '{}'::json NOT NULL,
	"audience_i18n" json DEFAULT '{}'::json NOT NULL,
	"estimated_time_i18n" json DEFAULT '{}'::json NOT NULL,
	"prompt_i18n" json DEFAULT '{}'::json NOT NULL,
	"prerequisites_i18n" json DEFAULT '{}'::json NOT NULL,
	"restrictions_i18n" json DEFAULT '{}'::json NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_catalog_items_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "workflow_catalog_skill_links" (
	"workflow_id" text NOT NULL,
	"skill_slug" text NOT NULL,
	"skill_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_catalog_skill_links_workflow_id_skill_slug_pk" PRIMARY KEY("workflow_id","skill_slug")
);
--> statement-breakpoint
ALTER TABLE "workflow_catalog_items" ADD CONSTRAINT "workflow_catalog_items_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_catalog_items" ADD CONSTRAINT "workflow_catalog_items_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_catalog_skill_links" ADD CONSTRAINT "workflow_catalog_skill_links_workflow_id_workflow_catalog_items_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_catalog_items_active_sort_idx" ON "workflow_catalog_items" USING btree ("is_active","is_featured","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "workflow_catalog_skill_links_workflow_sort_idx" ON "workflow_catalog_skill_links" USING btree ("workflow_id","sort_order");