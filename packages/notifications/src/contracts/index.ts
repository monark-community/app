import type { CoreNotificationKinds } from "./registry";

export * from "./events";
export * from "./registry";
export type { NotificationChannel, NotificationCategory } from "@monark/db";

/**
 * Per-kind data shape callers pass to `notify()`. Declared HERE — at the public
 * `@monark/notifications/contracts` entry — so a module's
 * `declare module "@monark/notifications/contracts"` augmentation merges into
 * the SAME interface `NotificationKind` reads. (It used to live in `./registry`
 * and was only re-exported here ; augmentations aimed at this entry then landed
 * on the re-export and silently never reached `NotificationKind`, so external
 * kinds fell out of the type.) Core kinds arrive via `extends`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NotificationDataRegistry extends CoreNotificationKinds {}
export type NotificationDataMap = NotificationDataRegistry;
export type NotificationKind = keyof NotificationDataMap & string;
