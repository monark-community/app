"use client";

import { Check, Copy, Send } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

function CopyRow({ label, value }: { label: string; value: string }) {
  const t = useTranslations("telegram");
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-xs">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            toast.success(t("copied"));
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          <span className="sr-only">{t("copy")}</span>
        </Button>
      </div>
    </div>
  );
}

export function TelegramSettings({ canManage }: { canManage: boolean }) {
  const t = useTranslations("telegram");
  const utils = trpc.useUtils();
  const status = trpc.telegram.connection.status.useQuery(undefined, { enabled: canManage });
  const [botToken, setBotToken] = useState("");

  const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "";

  const connect = trpc.telegram.connection.connect.useMutation({
    onSuccess: () => {
      setBotToken("");
      void utils.telegram.connection.status.invalidate();
      toast.success(t("connectedToast"));
    },
    onError: (e) => toast.error(e.message),
  });
  const disconnect = trpc.telegram.connection.disconnect.useMutation({
    onSuccess: () => {
      void utils.telegram.connection.status.invalidate();
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
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-9 w-48" />
      </div>
    );
  }

  const connected = status.data?.connected ?? false;
  const webhookUrl = status.data ? `${apiOrigin}${status.data.webhookPath}` : "";

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/40">
          <Send className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
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
            <CopyRow label={t("webhookUrl")} value={webhookUrl} />
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
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t("botTokenLabel")}</p>
              <Input
                type="password"
                autoComplete="off"
                placeholder="123456789:ABCdef…"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
            </div>
            <div className="pt-1">
              <Button
                type="button"
                onClick={() => connect.mutate({ botToken: botToken.trim(), apiOrigin })}
                disabled={connect.isPending || botToken.trim() === ""}
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
