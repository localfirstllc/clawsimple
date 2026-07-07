CREATE TABLE "usage_credit_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount_usd" numeric(12, 6) NOT NULL,
	"remaining_usd" numeric(12, 6) NOT NULL,
	"source_type" text,
	"source_id" text,
	"note" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_credit_grant_source_unique" UNIQUE("source_type","source_id")
);
--> statement-breakpoint
ALTER TABLE "usage_credit_grant" ADD CONSTRAINT "usage_credit_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_credit_grant_user_expires_idx" ON "usage_credit_grant" USING btree ("user_id","expires_at");