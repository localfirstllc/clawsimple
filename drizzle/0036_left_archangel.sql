CREATE TABLE "telegram_conversation_state" (
	"telegram_user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	"pending_command_text" text NOT NULL,
	"pending_user_text" text NOT NULL,
	"pending_raw_command" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_conversation_state_telegram_user_id_chat_id_pk" PRIMARY KEY("telegram_user_id","chat_id")
);
--> statement-breakpoint
ALTER TABLE "telegram_conversation_state" ADD CONSTRAINT "telegram_conversation_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_conversation_state_user_idx" ON "telegram_conversation_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telegram_conversation_state_expires_idx" ON "telegram_conversation_state" USING btree ("expires_at");