import { checkPasswordOffline } from "../contracts/password-check";
import type {
  PasswordCheckResult,
  PasswordContext,
  PasswordFailureReason,
} from "../contracts/password-rules";
import { isPasswordBreached } from "./data/hibp";

// Runs the pure offline rules and, on success, additionally checks HIBP. The
// shape of the return value matches `checkPasswordOffline` so callers can use
// the two interchangeably.
export async function checkPassword(
  password: string,
  context: PasswordContext = {},
): Promise<PasswordCheckResult> {
  const offline = checkPasswordOffline(password, context);
  if (!offline.ok) return offline;

  const breached = await isPasswordBreached(password.trim());
  if (!breached) return offline;

  const reasons: PasswordFailureReason[] = ["breached"];
  return { ok: false, reasons, score: 0 };
}
