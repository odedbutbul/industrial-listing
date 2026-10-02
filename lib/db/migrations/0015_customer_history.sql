CREATE TABLE "customer_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "channel" NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"external_order_id" text,
	"customer_id" uuid,
	"buyer_username" text,
	"initiator" text,
	"status" text,
	"is_open" boolean DEFAULT false NOT NULL,
	"reason" text,
	"comment" text,
	"amount" numeric(12, 2),
	"currency" text,
	"item_id" text,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_cases_kind_chk" CHECK ("customer_cases"."kind" in ('cancellation', 'refund', 'return', 'inquiry', 'case'))
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ebay_feedback_score" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ebay_positive_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ebay_registered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ebay_feedback_private" boolean;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ebay_positive_left" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ebay_neutral_left" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ebay_negative_left" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ebay_profile_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ebay_profile_error" text;--> statement-breakpoint
ALTER TABLE "customer_cases" ADD CONSTRAINT "customer_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_cases_uq" ON "customer_cases" USING btree ("channel","kind","external_id");--> statement-breakpoint
CREATE INDEX "customer_cases_customer_idx" ON "customer_cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_cases_order_idx" ON "customer_cases" USING btree ("external_order_id");