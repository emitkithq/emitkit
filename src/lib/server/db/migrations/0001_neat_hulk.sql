CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_id" text,
	"notify" boolean DEFAULT true NOT NULL,
	"source" varchar(50) DEFAULT 'api' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_org_created_idx" ON "event" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "event_channel_created_idx" ON "event" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "event_project_created_idx" ON "event" USING btree ("project_id","created_at");