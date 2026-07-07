ALTER TABLE "install_sessions" ADD COLUMN "exa_mode" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "exa_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "search_crawl_mode" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "search_crawl_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "notion_api_key_ciphertext" text;