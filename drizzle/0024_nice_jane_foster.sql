CREATE TABLE "server_pool" (
	"provider" text NOT NULL,
	"provider_instance_id" text NOT NULL,
	"display_name" text,
	"hostname" text,
	"ipv4" text,
	"ipv6" text,
	"region" text,
	"plan" text,
	"vcore" integer,
	"memory_mb" integer,
	"disk_gb" integer,
	"state" text,
	"status" text DEFAULT 'available' NOT NULL,
	"assigned_sid" text,
	"assigned_at" timestamp,
	"last_seen_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "server_pool_provider_provider_instance_id_pk" PRIMARY KEY("provider","provider_instance_id")
);
--> statement-breakpoint
ALTER TABLE "server_pool" ADD CONSTRAINT "server_pool_assigned_sid_install_sessions_id_fk" FOREIGN KEY ("assigned_sid") REFERENCES "public"."install_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_pool_status_idx" ON "server_pool" USING btree ("status");--> statement-breakpoint
CREATE INDEX "server_pool_provider_idx" ON "server_pool" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "server_pool_assigned_idx" ON "server_pool" USING btree ("assigned_sid");