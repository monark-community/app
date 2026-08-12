/** The public `@monark/files` bucket that achievement badge images upload into.
 *  Public so a badge image is directly (and cacheably) servable ; the achievement
 *  editor uploads here and stores the resulting `StoredFile` id in
 *  `Achievement.iconFileId`. */
export const ACHIEVEMENT_ICONS_BUCKET = "achievement-icons";

/** Image MIME types accepted for a badge image. */
export const ACHIEVEMENT_ICON_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];
