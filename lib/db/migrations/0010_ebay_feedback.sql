CREATE TABLE "ebay_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" text NOT NULL,
	"comment_type" text NOT NULL,
	"comment_text" text DEFAULT '' NOT NULL,
	"comment_time" timestamp with time zone NOT NULL,
	"buyer_masked" text,
	"buyer_score" integer,
	"item_id" text,
	"item_title" text,
	"item_price" numeric(12, 2),
	"currency" text,
	"response" text,
	"show_on_site" boolean DEFAULT false NOT NULL,
	"decided_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ebay_feedback_show_positive" CHECK (not "ebay_feedback"."show_on_site" or "ebay_feedback"."comment_type" = 'Positive')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ebay_feedback_feedback_id_uq" ON "ebay_feedback" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "ebay_feedback_time_idx" ON "ebay_feedback" USING btree ("comment_time");--> statement-breakpoint
CREATE INDEX "ebay_feedback_item_idx" ON "ebay_feedback" USING btree ("item_id");