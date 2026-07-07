ALTER TABLE "deployment_agents" ADD COLUMN "tg_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "custom_openai_models" text;--> statement-breakpoint
ALTER TABLE "install_sessions" ADD COLUMN "tg_token_ciphertext" text;