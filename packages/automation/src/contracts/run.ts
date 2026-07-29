/**
 * Run-time contracts shared between the engine (which writes them) and the web
 * editor (which renders them). Kept in `contracts` — not `server` — so the
 * client can import the log-line shape without pulling in server code.
 */

/** Severity of a node log line. Drives the editor's per-line color. */
export type AutomationRunStepLogLevel = "info" | "warn" | "error";

/**
 * One structured line a node emits during its step via `ctx.log(...)`,
 * persisted on the step's `logs` column and surfaced in the editor's per-node
 * Logs section.
 */
export interface AutomationRunStepLog {
  /** ISO-8601 timestamp when the line was emitted. */
  ts: string;
  level: AutomationRunStepLogLevel;
  message: string;
}

/** Cap per step so a chatty (or runaway) node can't bloat the row ; extra lines
 *  are dropped and a final truncation notice is appended by the engine. */
export const MAX_STEP_LOGS = 200;
/** Cap a single line's length (defensive against a huge interpolated value). */
export const MAX_STEP_LOG_MESSAGE = 2000;
