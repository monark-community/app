"use client";

import { AtSign } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

type CredKey = "consumerKey" | "consumerSecret" | "accessToken" | "accessTokenSecret";
const CRED_KEYS: CredKey[] = ["consumerKey", "consumerSecret", "accessToken", "accessTokenSecret"];
const EMPTY: Record<CredKey, string> = {
  consumerKey: "",
  consumerSecret: "",
  accessToken: "",
  accessTokenSecret: "",
};

export function XSettings({ canManage }: { canManage: boolean }) {
  const t = useTranslations("twitter");
  const utils = trpc.useUtils();
  const status = trpc.twitter.connection.status.useQuery(undefined, { enabled: canManage });
  const [creds, setCreds] = useState<Record<CredKey, string>>(EMPTY);

  const connect = trpc.twitter.connection.connect.useMutation({
    onSuccess: () => {
      setCreds(EMPTY);
      void utils.twitter.connection.status.invalidate();
      toast.success(t("connectedToast"));
    },
    onError: (e) => toast.error(e.message),
  });
  const disconnect = trpc.twitter.connection.disconnect.useMutation({
    onSuccess: () => {
      void utils.twitter.connection.status.invalidate();
      toast.success(t("disconnected"));
    },
    onError: (e) => toast.error(e.message),
  });

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">{t("noPermission")}</p>;
  }
  if (status.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-9 w-48" />
      </div>
    );
  }

  const connected = status.data?.connected ?? false;
  const allFilled = CRED_KEYS.every((k) => creds[k].trim() !== "");

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/40">
          <AtSign className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{t("connectionHeading")}</h2>
          <span
            className={
              connected
                ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            }
          >
            {connected ? t("connected") : t("notConnected")}
          </span>
        </div>

        {connected ? (
          <>
            <p className="text-sm text-muted-foreground">{t("connectedHint")}</p>
            <div className="pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {t("disconnect")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("connectHint")}</p>
            {CRED_KEYS.map((k) => (
              <div key={k} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t(`fields.${k}`)}</p>
                <Input
                  type="password"
                  autoComplete="off"
                  value={creds[k]}
                  onChange={(e) => setCreds((c) => ({ ...c, [k]: e.target.value }))}
                />
              </div>
            ))}
            <div className="pt-1">
              <Button
                type="button"
                onClick={() =>
                  connect.mutate({
                    consumerKey: creds.consumerKey.trim(),
                    consumerSecret: creds.consumerSecret.trim(),
                    accessToken: creds.accessToken.trim(),
                    accessTokenSecret: creds.accessTokenSecret.trim(),
                  })
                }
                disabled={connect.isPending || !allFilled}
              >
                {t("connect")}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">{t("setupHeading")}</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
          <li>{t("step4")}</li>
        </ol>
      </section>
    </div>
  );
}
