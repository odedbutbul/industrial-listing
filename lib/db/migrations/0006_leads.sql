CREATE TYPE "public"."lead_kind" AS ENUM('rfq', 'msg');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'in_progress', 'quoted', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"kind" "lead_kind" NOT NULL,
	"wp_id" integer NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"name" text,
	"company" text,
	"email" text NOT NULL,
	"phone" text,
	"country" text,
	"country_name" text,
	"part" text,
	"maker" text,
	"qty" integer,
	"condition" text,
	"needed_by" text,
	"message" text,
	"order_ref" text,
	"source_url" text,
	"short" boolean DEFAULT false NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_via" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"note" text,
	"status_changed_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_qty_pos" CHECK ("leads"."qty" is null or "leads"."qty" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "leads_ref_uq" ON "leads" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "leads_submitted_idx" ON "leads" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");