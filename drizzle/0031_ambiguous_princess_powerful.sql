CREATE TABLE "deployment_backup_passwords" (
	"user_id" text NOT NULL,
	"seat_key" text NOT NULL,
	"ciphertext" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_backup_passwords_user_id_seat_key_pk" PRIMARY KEY("user_id","seat_key")
);
--> statement-breakpoint
ALTER TABLE "deployment_backup_passwords" ADD CONSTRAINT "deployment_backup_passwords_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_backup_passwords_user_updated_idx" ON "deployment_backup_passwords" USING btree ("user_id","updated_at");