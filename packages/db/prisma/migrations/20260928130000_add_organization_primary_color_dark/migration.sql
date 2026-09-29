-- Optional dark-mode brand color, next to primaryColor. Null means the web
-- theme derives the dark-mode color from primaryColor, adapting it only when
-- it lacks contrast on the dark background.
ALTER TABLE "Organization" ADD COLUMN "primaryColorDark" TEXT;
