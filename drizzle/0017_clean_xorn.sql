CREATE TABLE "telegram_account_link" (
	"user_id" text NOT NULL,
	"telegram_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_account_link_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "telegram_account_link_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
ALTER TABLE "telegram_account_link" ADD CONSTRAINT "telegram_account_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_account_link_user_id_idx" ON "telegram_account_link" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telegram_account_link_tg_user_id_idx" ON "telegram_account_link" USING btree ("telegram_user_id");