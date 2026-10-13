CREATE TABLE "offer_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"ebay_item_id" text NOT NULL,
	"trigger" text NOT NULL,
	"our_price" numeric(12, 2),
	"their_price" numeric(12, 2),
	"gap_pct" numeric(8, 2),
	"theirs" jsonb,
	"diffs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai" jsonb,
	"ai_model" text,
	"ai_cost_usd" numeric(10, 6),
	"ai_error" text,
	"error" text,
	"compared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offer_comparisons" ADD CONSTRAINT "offer_comparisons_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_comparisons_product_item_uq" ON "offer_comparisons" USING btree ("product_id","ebay_item_id");--> statement-breakpoint
CREATE INDEX "offer_comparisons_compared_at_idx" ON "offer_comparisons" USING btree ("compared_at");