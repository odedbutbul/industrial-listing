CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"data" "bytea" NOT NULL,
	"woo_media_id" bigint,
	"woo_src" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_files_mime_chk" CHECK ("media_files"."mime" in ('image/jpeg', 'image/png', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source" text DEFAULT 'ebay' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "short_description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sale_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sale_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sale_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_slugs" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "package_dims" jsonb;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_files_product_idx" ON "media_files" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_source_chk" CHECK ("products"."source" in ('ebay', 'manual'));