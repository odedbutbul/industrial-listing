CREATE TABLE "competitor_offers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"check_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"ebay_item_id" text NOT NULL,
	"legacy_item_id" text,
	"title" text NOT NULL,
	"seller" text,
	"seller_feedback_score" integer,
	"price" numeric(12, 2),
	"currency" text,
	"shipping" numeric(12, 2),
	"shipping_type" text,
	"condition_id" text,
	"condition" text,
	"condition_group" text NOT NULL,
	"buying_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"url" text,
	"country" text,
	"match_level" text NOT NULL,
	"match_score" integer NOT NULL,
	"compared" boolean DEFAULT false NOT NULL,
	"manual_match" boolean
);
--> statement-breakpoint
CREATE TABLE "price_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"country" text NOT NULL,
	"query" text NOT NULL,
	"total_results" integer DEFAULT 0 NOT NULL,
	"our_price" numeric(12, 2),
	"our_shipping" numeric(12, 2),
	"our_shipping_options" jsonb,
	"condition_group" text NOT NULL,
	"compare_count" integer DEFAULT 0 NOT NULL,
	"min_price" numeric(12, 2),
	"median_price" numeric(12, 2),
	"max_price" numeric(12, 2),
	"vs_median_pct" numeric(8, 2),
	"vs_min_pct" numeric(8, 2),
	"position" text NOT NULL,
	"basis" text NOT NULL,
	"item_stats" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "competitor_offers" ADD CONSTRAINT "competitor_offers_check_id_price_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."price_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_offers" ADD CONSTRAINT "competitor_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_checks" ADD CONSTRAINT "price_checks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_offers_check_item_uq" ON "competitor_offers" USING btree ("check_id","ebay_item_id");--> statement-breakpoint
CREATE INDEX "competitor_offers_product_idx" ON "competitor_offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "competitor_offers_seller_idx" ON "competitor_offers" USING btree ("seller");--> statement-breakpoint
CREATE INDEX "price_checks_product_idx" ON "price_checks" USING btree ("product_id","checked_at");--> statement-breakpoint
CREATE INDEX "price_checks_run_idx" ON "price_checks" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_checks_run_product_country_uq" ON "price_checks" USING btree ("run_id","product_id","country");