CREATE TABLE "deployment_agents" (
	"sid" text NOT NULL,
	"agent_id" text NOT NULL,
	"display_name" text,
	"account_id" text,
	"model" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_agents_sid_agent_id_pk" PRIMARY KEY("sid","agent_id")
);
--> statement-breakpoint
ALTER TABLE "deployment_agents" ADD CONSTRAINT "deployment_agents_sid_install_sessions_id_fk" FOREIGN KEY ("sid") REFERENCES "public"."install_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_agents_sid_active_idx" ON "deployment_agents" USING btree ("sid","active");--> statement-breakpoint
CREATE INDEX "deployment_agents_sid_updated_idx" ON "deployment_agents" USING btree ("sid","updated_at");