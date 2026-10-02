CREATE TABLE "ebay_blocked_buyers" (
	"username" text PRIMARY KEY NOT NULL,
	"note" text,
	"source" text NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
