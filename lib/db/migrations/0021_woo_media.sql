CREATE TABLE "woo_media" (
	"ebay_image_id" text PRIMARY KEY NOT NULL,
	"woo_attachment_id" bigint NOT NULL,
	"source_url" text NOT NULL,
	"file_name" text NOT NULL,
	"woo_product_id" bigint,
	"bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "woo_media_woo_attachment_id_unique" UNIQUE("woo_attachment_id")
);
