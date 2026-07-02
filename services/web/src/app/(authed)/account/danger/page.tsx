import { AccountPageHeader } from "../account-page-header";
import { DangerZoneSection } from "../danger-zone-section";

export default function AccountDangerPage() {
  return (
    <div className="space-y-8">
      <AccountPageHeader tab="danger" tone="danger" />
      <DangerZoneSection />
    </div>
  );
}
