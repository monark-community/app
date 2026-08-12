-- Achievements are image-only now ; drop the legacy emoji column.
ALTER TABLE "Achievement" DROP COLUMN "icon";
