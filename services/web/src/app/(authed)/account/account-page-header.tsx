import { getTranslations } from "next-intl/server"
import { PageHeader } from "@/components/page-header"

/**
 * Page-level h1 + subtitle for every `/account/*` route. Uses the
 * existing `account.tabs.<tab>` label as the title (matches the
 * sidebar item) plus a per-tab subtitle from `account.subtitles.<tab>`.
 *
 * Each tab page renders this once at the top of its layout :
 *
 *   <AccountPageHeader tab="security" />
 *   <SecuritySection />
 *
 * Delegates to the shared `<PageHeader>` so heading hierarchy + the
 * bottom Separator stay consistent with every other detail page in the
 * app. No back button : the sidebar already carries top-level nav and
 * tab pages don't have a "parent" to return to.
 *
 * `/account/profile` skips this header entirely because the UserBanner
 * inside ProfileSection serves as its hero.
 */
export async function AccountPageHeader({
  tab,
  tone = "default",
}: {
  tab: "profile" | "security" | "notifications" | "danger"
  tone?: "default" | "danger"
}) {
  const t = await getTranslations("account")
  return (
    <PageHeader
      title={t(`tabs.${tab}`)}
      subtitle={t(`subtitles.${tab}`)}
      tone={tone}
    />
  )
}
