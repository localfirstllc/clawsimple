ALTER TABLE "install_sessions" ADD COLUMN "gmail_gcp_project_id" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "gmail_oauth_client_id" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "gmail_oauth_client_secret_ciphertext" text;