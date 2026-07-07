ALTER TABLE "install_sessions" RENAME COLUMN "coding_agent_base_url" TO "preset_proxy_base_url";--> statement-breakpoint
ALTER TABLE "install_sessions" RENAME COLUMN "coding_agent_model" TO "preset_proxy_model";--> statement-breakpoint
ALTER TABLE "install_sessions" RENAME COLUMN "coding_agent_models" TO "preset_proxy_models";--> statement-breakpoint
ALTER TABLE "install_sessions" RENAME COLUMN "coding_agent_api_key_ciphertext" TO "preset_proxy_api_key_ciphertext";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "ai_source";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "custom_openai_models";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "custom_openai_base_url";--> statement-breakpoint
ALTER TABLE "install_sessions" DROP COLUMN "custom_openai_api_key_ciphertext";