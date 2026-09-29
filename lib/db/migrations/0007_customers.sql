CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email_enc" text,
	"email_hash" text,
	"phone_enc" text,
	"country_code" text,
	"region" text,
	"city" text,
	"ebay_username" text,
	"first_channel" "channel" NOT NULL,
	"details_from_at" timestamp with time zone,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"consent_source" text,
	"consent_at" timestamp with time zone,
	"consent_note" text,
	"marketing_blocked" text,
	"unsubscribed_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_country" text;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_hash_uq" ON "customers" USING btree ("email_hash") WHERE "customers"."email_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_ebay_username_uq" ON "customers" USING btree ("ebay_username") WHERE "customers"."ebay_username" is not null;--> statement-breakpoint
CREATE INDEX "customers_country_idx" ON "customers" USING btree ("country_code");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");