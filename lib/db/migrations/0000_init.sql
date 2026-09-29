CREATE TYPE "public"."channel" AS ENUM('ebay', 'woo');--> statement-breakpoint
CREATE TYPE "public"."ebay_environment" AS ENUM('sandbox', 'production');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('initial', 'sale', 'cancel', 'refund', 'manual_adjust', 'reconcile_correction');--> statement-breakpoint
CREATE TYPE "public"."ledger_source" AS ENUM('ebay', 'woo', 'manual', 'reconcile', 'import');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('applied', 'cancelled', 'unmapped', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."push_status" AS ENUM('pending', 'done', 'failed', 'superseded');--> statement-breakpoint
CREATE TABLE "channel_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"ebay_item_id" text,
	"woo_product_id" bigint,
	"woo_variation_id" bigint,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"last_ebay_qty" integer,
	"last_woo_qty" integer,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_mappings_product_id_unique" UNIQUE("product_id"),
	CONSTRAINT "channel_mappings_sku_unique" UNIQUE("sku"),
	CONSTRAINT "channel_mappings_ebay_item_id_unique" UNIQUE("ebay_item_id"),
	CONSTRAINT "channel_mappings_woo_product_id_unique" UNIQUE("woo_product_id")
);
--> statement-breakpoint
CREATE TABLE "ebay_tokens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ebay_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"environment" "ebay_environment" NOT NULL,
	"ebay_user_id" text,
	"access_token_enc" text NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"refresh_expires_at" timestamp with time zone,
	"scopes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ebay_tokens_environment_unique" UNIQUE("environment")
);
--> statement-breakpoint
CREATE TABLE "pending_pushes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"target" "channel" NOT NULL,
	"desired_qty" integer NOT NULL,
	"status" "push_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_pushes_qty_nonneg" CHECK ("pending_pushes"."desired_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "processed_orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel" "channel" NOT NULL,
	"external_order_id" text NOT NULL,
	"external_line_id" text NOT NULL,
	"product_id" uuid,
	"sku" text,
	"quantity" integer NOT NULL,
	"status" "order_status" NOT NULL,
	"sale_ledger_id" bigint,
	"cancel_ledger_id" bigint,
	"order_created_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"condition" text,
	"price" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brand" text,
	"mpn" text,
	"ebay_category_id" text,
	"ebay_category_name" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"source" "ledger_source" NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"external_order_id" text,
	"external_line_id" text,
	"idempotency_key" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "stock_ledger_delta_nonzero" CHECK ("stock_ledger"."delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid,
	"job" text NOT NULL,
	"channel" "channel",
	"action" text NOT NULL,
	"product_id" uuid,
	"success" boolean NOT NULL,
	"error" text,
	"details" jsonb,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "channel_mappings" ADD CONSTRAINT "channel_mappings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_pushes" ADD CONSTRAINT "pending_pushes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_orders" ADD CONSTRAINT "processed_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_orders" ADD CONSTRAINT "processed_orders_sale_ledger_id_stock_ledger_id_fk" FOREIGN KEY ("sale_ledger_id") REFERENCES "public"."stock_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_orders" ADD CONSTRAINT "processed_orders_cancel_ledger_id_stock_ledger_id_fk" FOREIGN KEY ("cancel_ledger_id") REFERENCES "public"."stock_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_pushes_one_pending_uq" ON "pending_pushes" USING btree ("product_id","target") WHERE "pending_pushes"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "pending_pushes_due_idx" ON "pending_pushes" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "processed_orders_line_uq" ON "processed_orders" USING btree ("channel","external_order_id","external_line_id");--> statement-breakpoint
CREATE INDEX "processed_orders_product_idx" ON "processed_orders" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_ledger_product_idx" ON "stock_ledger" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sync_log_created_idx" ON "sync_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sync_log_product_idx" ON "sync_log" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sync_log_run_idx" ON "sync_log" USING btree ("run_id");