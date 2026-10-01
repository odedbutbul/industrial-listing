-- קבצים שלא הגיעו לחנות לא נשמרים יותר במערכת (בייצור הטבלה ריקה — 0011 לא נפרס לפני כן)
DELETE FROM "media_files" WHERE "woo_media_id" IS NULL OR "woo_src" IS NULL;--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "woo_media_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "woo_src" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_files" DROP COLUMN "data";
