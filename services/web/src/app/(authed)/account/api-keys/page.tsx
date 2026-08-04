import { AccountPageHeader } from "../account-page-header";
import { ApiKeysSection } from "../api-keys-section";

/**
 * Account → API keys tab. Lives at `/account/api-keys` so the URL matches
 * the sidebar item ; the parent layout owns the AppBar + sidebar chrome.
 * The section fetches the caller's own keys client-side (gated by the
 * `api-keys.manage` permission).
 */
export default function AccountApiKeysPage() {
  return (
    <div className="space-y-8">
      <AccountPageHeader tab="apiKeys" />
      <ApiKeysSection />
    </div>
  );
}
