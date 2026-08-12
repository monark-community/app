"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GithubSettings } from "./github-settings";
import { TelegramSettings } from "./telegram-settings";
import { XSettings } from "./x-settings";
import { DiscordSettings } from "./discord-settings";

type Integration = { enabled: boolean; canManage?: boolean };
export type AutomationIntegrationsProps = {
  integrations: {
    github: Integration;
    telegram: Integration;
    twitter: Integration;
    discord: Integration;
  };
};

// The automation section's integrations hub: one tab per third-party service
// (GitHub / Telegram / X / Discord), each rendering that module's own settings
// surface. A disabled integration (its feature flag off) shows a hint instead of
// its config. Brand names aren't localized, so the tab labels are literals.
export function AutomationIntegrations({ integrations }: AutomationIntegrationsProps) {
  const t = useTranslations("admin.automation");
  const Disabled = ({ flag }: { flag: string }) => (
    <p className="text-sm text-muted-foreground">{t("notEnabled", { flag })}</p>
  );
  const tabs = [
    { id: "github", label: "GitHub" },
    { id: "telegram", label: "Telegram" },
    { id: "twitter", label: "X (Twitter)" },
    { id: "discord", label: "Discord" },
  ];
  return (
    <Tabs defaultValue="github">
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="github" className="max-w-3xl pt-4">
        {integrations.github.enabled ? (
          <GithubSettings canManage={Boolean(integrations.github.canManage)} />
        ) : (
          <Disabled flag="github.enabled" />
        )}
      </TabsContent>
      <TabsContent value="telegram" className="max-w-3xl pt-4">
        {integrations.telegram.enabled ? (
          <TelegramSettings canManage={Boolean(integrations.telegram.canManage)} />
        ) : (
          <Disabled flag="telegram.enabled" />
        )}
      </TabsContent>
      <TabsContent value="twitter" className="max-w-3xl pt-4">
        {integrations.twitter.enabled ? (
          <XSettings canManage={Boolean(integrations.twitter.canManage)} />
        ) : (
          <Disabled flag="twitter.enabled" />
        )}
      </TabsContent>
      <TabsContent value="discord" className="max-w-3xl pt-4">
        {integrations.discord.enabled ? <DiscordSettings /> : <Disabled flag="discord.enabled" />}
      </TabsContent>
    </Tabs>
  );
}
