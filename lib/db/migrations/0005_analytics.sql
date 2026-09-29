CREATE TABLE "ga_breakdown_daily" (
	"date" text NOT NULL,
	"dimension" text NOT NULL,
	"value" text NOT NULL,
	"users" integer NOT NULL,
	"sessions" integer NOT NULL,
	"engaged_sessions" integer NOT NULL,
	"purchases" integer NOT NULL,
	"revenue" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ga_items_daily" (
	"date" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"viewed" integer NOT NULL,
	"added_to_cart" integer NOT NULL,
	"purchased" integer NOT NULL,
	"revenue" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ga_pages_daily" (
	"date" text NOT NULL,
	"page" text NOT NULL,
	"views" integer NOT NULL,
	"users" integer NOT NULL,
	"engagement_seconds" numeric(16, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ga_site_daily" (
	"date" text PRIMARY KEY NOT NULL,
	"users" integer NOT NULL,
	"new_users" integer NOT NULL,
	"sessions" integer NOT NULL,
	"engaged_sessions" integer NOT NULL,
	"engagement_seconds" numeric(16, 2) NOT NULL,
	"page_views" integer NOT NULL,
	"add_to_carts" integer NOT NULL,
	"checkouts" integer NOT NULL,
	"purchases" integer NOT NULL,
	"revenue" numeric(14, 2) NOT NULL,
	"ad_cost" numeric(14, 2),
	"ad_clicks" integer
);
--> statement-breakpoint
CREATE TABLE "gsc_pages_daily" (
	"date" text NOT NULL,
	"page" text NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"position_sum" numeric(16, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_queries_daily" (
	"date" text NOT NULL,
	"query" text NOT NULL,
	"page" text NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"position_sum" numeric(16, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_spend" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marketing_spend_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"month" text NOT NULL,
	"channel" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_spend_amount_nonneg" CHECK ("marketing_spend"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "woo_catalog" (
	"woo_product_id" bigint PRIMARY KEY NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"path" text,
	"status" text NOT NULL,
	"stock_status" text,
	"stock_quantity" integer,
	"price" numeric(12, 2),
	"woo_created_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ga_breakdown_daily_uq" ON "ga_breakdown_daily" USING btree ("date","dimension","value");--> statement-breakpoint
CREATE UNIQUE INDEX "ga_items_daily_uq" ON "ga_items_daily" USING btree ("date","item_id","item_name");--> statement-breakpoint
CREATE UNIQUE INDEX "ga_pages_daily_uq" ON "ga_pages_daily" USING btree ("date","page");--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_pages_daily_uq" ON "gsc_pages_daily" USING btree ("date","page");--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_queries_daily_uq" ON "gsc_queries_daily" USING btree ("date","query","page");--> statement-breakpoint
CREATE INDEX "gsc_queries_daily_date_idx" ON "gsc_queries_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_spend_month_channel_uq" ON "marketing_spend" USING btree ("month","channel");