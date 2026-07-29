/**
 * Built-in trigger node type keys and the sentinel `triggerEventType` each one
 * stores on its automation. Shared by the editor (to render trigger-specific
 * UI) and the server (to derive the automation's stored trigger + route inbound
 * HTTP calls).
 *
 * Manual and HTTP triggers don't come off the domain-event bus, so they store a
 * sentinel event type in the `automation.*` namespace — which the event
 * subscriber deliberately ignores (it skips `automation.*` to avoid feedback
 * loops) — so they can never be fired by a real platform event. A manual
 * trigger only runs via "Run now" ; an HTTP trigger only via its endpoint.
 */

export const EVENT_TRIGGER_TYPE = "automation.event-trigger";
export const MANUAL_TRIGGER_TYPE = "automation.manual-trigger";
export const HTTP_TRIGGER_TYPE = "automation.http-trigger";
export const SCHEDULE_TRIGGER_TYPE = "automation.schedule-trigger";

/** Sentinel `Automation.triggerEventType` values (bus-ignored `automation.*`). */
export const MANUAL_TRIGGER_EVENT = "automation.manual";
export const HTTP_TRIGGER_EVENT = "automation.http";
export const SCHEDULE_TRIGGER_EVENT = "automation.schedule";
