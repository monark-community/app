import { ProfileSection } from "../profile-section";

// `/account/profile` skips the AccountPageHeader because the UserBanner
// inside ProfileSection serves as the page hero (avatar + display name
// + email run flush to the AppBar bottom). The other account tabs keep
// their AccountPageHeader since they don't have an identity surface.
export default function AccountProfilePage() {
  return (
    <div className="space-y-8">
      <ProfileSection />
    </div>
  );
}
