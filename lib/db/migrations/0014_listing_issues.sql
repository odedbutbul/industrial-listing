CREATE TABLE "listing_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"check" text NOT NULL,
	"severity" text NOT NULL,
	"key" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "listing_issues_severity_chk" CHECK ("listing_issues"."severity" in ('high', 'medium', 'low')),
	CONSTRAINT "listing_issues_status_chk" CHECK ("listing_issues"."status" in ('open', 'dismissed', 'resolved'))
);
--> statement-breakpoint
ALTER TABLE "listing_issues" ADD CONSTRAINT "listing_issues_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_issues_product_key_uq" ON "listing_issues" USING btree ("product_id","key");--> statement-breakpoint
CREATE INDEX "listing_issues_status_idx" ON "listing_issues" USING btree ("status","severity");