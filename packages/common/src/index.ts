export * from "./errors";
export * from "./result";
export {
  blocksToText,
  checklistProgress,
  textToBlocks,
  isDocumentValue,
  EMPTY_DOCUMENT,
  type DocumentBlock,
  type ChecklistProgress,
} from "./blocks";
export { logger } from "./log";
export { emit, on, WILDCARD_EVENT_TYPE } from "./events";
export { installDevEventTap, recentDevEvents, type DevEventEntry } from "./dev-event-log";
export {
  registerEventTypes,
  getEventTypeDescriptor,
  eventFieldsFor,
  listEventTypes,
  listEventTypesByModule,
  registerOrgScopedEventTypeVisibility,
  orgVisibleEventTypes,
  COMMON_EVENT_FIELDS,
  _resetEventRegistryForTesting,
  type EventTypeDescriptor,
  type EventFieldDescriptor,
  type EventFieldType,
  type OrgScopedEventTypeResolver,
} from "./event-registry";
export type { DomainEvent, DomainEventBase } from "./contracts/events";
export {
  registerSearchSource,
  listSearchSources,
  _resetSearchRegistryForTesting,
  type SearchHit,
  type SearchSource,
} from "./search-registry";
export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  resolveLimit,
  cursorFindArgs,
  toPage,
  type PaginationArgs,
  type Paginated,
} from "./pagination";
