CREATE TYPE "public"."order_state" AS ENUM('paid', 'pending', 'cancel_requested', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "channel" NOT NULL,
	"external_order_id" text NOT NULL,
	"state" "order_state" NOT NULL,
	"source_status" text,
	"fulfillment_status" text,
	"placed_at" timestamp with time zone NOT NULL,
	"source_updated_at" timestamp with time zone,
	"total" numeric(12, 2),
	"currency" text,
	"line_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processed_orders" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "processed_orders" ADD COLUMN "external_item_id" text;--> statement-breakpoint
ALTER TABLE "processed_orders" ADD COLUMN "line_total" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "processed_orders" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "processed_orders" ADD COLUMN "note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_channel_external_uq" ON "orders" USING btree ("channel","external_order_id");--> statement-breakpoint
CREATE INDEX "orders_placed_idx" ON "orders" USING btree ("placed_at");