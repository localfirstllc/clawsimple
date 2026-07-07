CREATE TABLE "email_unsubscribe" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"source" text DEFAULT 'marketing',
	"unsubscribed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_unsubscribe_email_unique" UNIQUE("email"),
	CONSTRAINT "email_unsubscribe_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "email_unsubscribe" ADD CONSTRAINT "email_unsubscribe_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;