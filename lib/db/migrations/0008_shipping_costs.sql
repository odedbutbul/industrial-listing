ALTER TABLE "products" ADD COLUMN "shipping_costs" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shipping_costs_fetched_at" timestamp with time zone;