CREATE TYPE "public"."install_status" AS ENUM('created', 'started', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "install_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"channel" text NOT NULL,
	"status" "install_status" DEFAULT 'created' NOT NULL,
	"completed_at" timestamp,
	"error_code" text,
	"server_fingerprint" json
);
