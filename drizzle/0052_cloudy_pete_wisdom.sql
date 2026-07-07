ALTER TABLE "install_sessions" ADD COLUMN "mailgun_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "mailgun_backup_email" text;