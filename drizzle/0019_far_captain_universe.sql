CREATE TABLE "usage_credit_balance" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount_usd" numeric(12, 6) NOT NULL,
	"entry_type" text NOT NULL,
	"source_type" text,
	"source_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_credit_ledger_source_unique" UNIQUE("source_type","source_id")
);
--> statement-breakpoint
ALTER TABLE "usage_credit_balance" ADD CONSTRAINT "usage_credit_balance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_credit_ledger" ADD CONSTRAINT "usage_credit_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_credit_balance_updated_idx" ON "usage_credit_balance" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "usage_credit_ledger_user_created_idx" ON "usage_credit_ledger" USING btree ("user_id","created_at");