ALTER TABLE "customers" ADD COLUMN "conduct_override" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "conduct_note" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "conduct_set_at" timestamp with time zone;--> statement-breakpoint
-- ביטולים מ-Post-Order שנשמרו במזהה הישן (itemId-transactionId) בריצה הראשונה — כפולים; נמשכים מחדש בקוד המתוקן
DELETE FROM "customer_cases" WHERE "kind" = 'cancellation' AND "source" = 'post_order' AND "external_id" ~ '^[0-9]+-[0-9]+$';--> statement-breakpoint
-- פרופילים שנכשלו בריצה הראשונה (DetailLevel) — ינסו שוב בריצה הבאה
UPDATE "customers" SET "ebay_profile_fetched_at" = NULL, "ebay_profile_error" = NULL WHERE "ebay_feedback_score" IS NULL AND "ebay_profile_error" IS NOT NULL;