CREATE TABLE "user_provider_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"credential_ref" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_provider_connections_provider_account_uniq" UNIQUE("user_id","provider","external_account_id")
);
--> statement-breakpoint
ALTER TABLE "user_provider_connections" ADD CONSTRAINT "user_provider_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_provider_connections_user_provider_idx" ON "user_provider_connections" USING btree ("user_id","provider","updated_at");