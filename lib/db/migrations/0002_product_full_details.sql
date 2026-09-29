ALTER TABLE "products" ADD COLUMN "subtitle" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "condition_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "condition_description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "item_specifics" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shipping" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ebay_listing_started_at" timestamp with time zone;