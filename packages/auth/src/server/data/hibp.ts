import { createHash } from "node:crypto"
import { logger } from "@monark/common"

function sha1Hex(input: string): string {
  return createHash("sha1").update(input).digest("hex")
}

// k-anonymity check against https://api.pwnedpasswords.com. We send only the
// first 5 chars of the SHA-1; HIBP returns the list of matching hash suffixes
// and we check locally. The plaintext never leaves our process.
//
// Degrade-open: if the upstream call fails, log a warning and return false so
// the password isn't rejected over a transient network blip.
export async function isPasswordBreached(password: string): Promise<boolean> {
  const sha1 = sha1Hex(password).toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    })
    if (!res.ok) {
      logger.warn({ status: res.status }, "HIBP check failed; degrading open")
      return false
    }
    const text = await res.text()
    return text.split("\n").some((line) => line.split(":")[0]?.trim() === suffix)
  } catch (error) {
    logger.warn({ err: error }, "HIBP check threw; degrading open")
    return false
  }
}
