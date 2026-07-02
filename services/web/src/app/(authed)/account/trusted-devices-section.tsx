"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSection } from "@/components/page-section";
import { TrustedDeviceCard } from "@/components/trusted-device-card";
import { trpc } from "@/lib/trpc";
import { revokeAllAndSignOutAction, revokeCurrentDeviceAndSignOutAction } from "./actions";

// Trust-window options surfaced in the Select. Kept inline (matches the
// server-side Zod's `TRUSTED_DEVICE_TTL_DAYS_OPTIONS`) ; drift between
// the two would be caught by the mutation rejecting on save.
const TTL_OPTIONS = [30, 60, 90] as const;
type TtlOption = (typeof TTL_OPTIONS)[number];
// Fallback shown when a user row carries a value outside the current
// option list (legacy 400-day rows from when 400 was selectable, or
// values set via direct DB tampering). Picks the longest current
// option so the visual change feels conservative.
const DEFAULT_TTL = 90;

export function TrustedDevicesSection({ currentDeviceId }: { currentDeviceId: string | null }) {
  const t = useTranslations("account.trustedDevices");
  const router = useRouter();
  const utils = trpc.useUtils();
  const query = trpc.auth.trustedDevices.mine.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const revoke = trpc.auth.trustedDevices.revoke.useMutation({
    onSuccess: () => void utils.auth.trustedDevices.mine.invalidate(),
  });
  const meQuery = trpc.users.me.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const ttlMutation = trpc.users.updateTrustedDeviceTtl.useMutation({
    onSuccess: () => {
      // Refresh both `users.me` (current value) and the device list
      // (each row's `expiresAt` slid to the new window — surfaced in
      // the card once the matching UI lands).
      void utils.users.me.invalidate();
      void utils.auth.trustedDevices.mine.invalidate();
    },
    onError: () => {
      toast.error(t("ttl.saveError"));
    },
  });
  const currentTtl = (meQuery.data?.trustedDeviceTtlDays ?? DEFAULT_TTL) as number;
  // Snap whatever's in the DB to one of the option pegs ; a value that
  // was set before the current option list (or via direct DB tampering)
  // doesn't break the Select.
  const ttlValueForSelect = (
    (TTL_OPTIONS as readonly number[]).includes(currentTtl) ? currentTtl : DEFAULT_TTL
  ).toString();

  // Confirm-dialog state. We open the dialog when the user clicks revoke on
  // either the current device or the "revoke all" button ; both paths sign
  // the user out, so a single dialog with mode-dependent copy is enough.
  const [confirm, setConfirm] = useState<
    { mode: "current"; deviceId: string } | { mode: "all" } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const list = query.data ?? [];
  const labels = {
    firstSeen: t("fields.firstSeen"),
    lastSeen: t("fields.lastSeen"),
    ip: t("fields.ip"),
    location: t("fields.location"),
    localDev: t("fields.localDev"),
    device: t("fields.device"),
    totpVerified: t("fields.totpVerified"),
    current: t("current"),
  };

  function onRevokeClick(deviceId: string) {
    if (deviceId === currentDeviceId) {
      setConfirm({ mode: "current", deviceId });
      return;
    }
    revoke.mutate({ deviceId });
  }

  function onConfirm() {
    if (!confirm) return;
    startTransition(async () => {
      const result =
        confirm.mode === "current"
          ? await revokeCurrentDeviceAndSignOutAction({ deviceId: confirm.deviceId })
          : await revokeAllAndSignOutAction();
      setConfirm(null);
      if (result.ok) {
        // Cache is gone with the session ; reset before navigating so we
        // don't flash stale "trusted devices" data on the way to /signin.
        utils.invalidate();
        router.replace("/signin");
        router.refresh();
      }
    });
  }

  const dialogCopy =
    confirm?.mode === "all"
      ? {
          title: t("revokeAllDialog.title"),
          description: t("revokeAllDialog.description"),
          confirm: t("revokeAllDialog.confirm"),
        }
      : {
          title: t("revokeCurrentDialog.title"),
          description: t("revokeCurrentDialog.description"),
          confirm: t("revokeCurrentDialog.confirm"),
        };

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")} contentClassName="space-y-3">
      {/*
          Trust-window selector. Sits above the device list so the user
          reads "here's how long trust lasts" before "here are the
          trusted devices". On change, the mutation slides every active
          row's `expiresAt` forward by the new TTL so the choice has
          immediate effect.
        */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("ttl.label")}</p>
          <p className="text-xs text-muted-foreground">{t("ttl.help")}</p>
        </div>
        <Select
          value={ttlValueForSelect}
          onValueChange={(raw) => {
            const days = Number.parseInt(raw, 10) as TtlOption;
            if (!(TTL_OPTIONS as readonly number[]).includes(days)) return;
            ttlMutation.mutate({ days });
          }}
          disabled={meQuery.isLoading || ttlMutation.isPending}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TTL_OPTIONS.map((days) => (
              <SelectItem key={days} value={days.toString()}>
                {t(`ttl.option${days}` as `ttl.option${TtlOption}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {query.isLoading && (
        <div className="space-y-2" aria-busy="true" aria-label={t("resolving")}>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-4">
              <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!query.isLoading && list.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}
      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((device) => {
            // Format the title in the user's locale instead of trusting
            // the English-only `device.label` baked at insert time. When
            // the UA parser failed both browser + os, fall back to the
            // localized "Unknown device" string.
            const localizedLabel =
              device.browserName && device.osName
                ? t("deviceTitle", {
                    browser: device.browserName,
                    os: device.osName,
                  })
                : (device.browserName ?? device.osName ?? t("deviceUnknown"));
            return (
              <TrustedDeviceCard
                key={device.id}
                label={localizedLabel}
                userAgent={device.userAgent}
                deviceType={device.deviceType}
                deviceVendor={device.deviceVendor}
                deviceModel={device.deviceModel}
                firstSeenAt={device.firstSeenAt}
                lastSeenAt={device.lastSeenAt}
                lastSeenIp={device.lastSeenIp}
                country={device.country}
                isCurrent={device.id === currentDeviceId}
                onRevoke={() => onRevokeClick(device.id)}
                revokePending={revoke.isPending}
                revokeLabel={t("revoke")}
                labels={labels}
              />
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? "…" : t("refresh")}
        </Button>
        {list.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirm({ mode: "all" })}
            disabled={isPending}
            className="ml-auto text-destructive hover:text-destructive"
          >
            <ShieldOff className="mr-1 h-3 w-3" aria-hidden />
            {t("revokeAll")}
          </Button>
        )}
      </div>

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogCopy.title}</DialogTitle>
            <DialogDescription>{dialogCopy.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirm(null)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending}>
              {isPending ? "…" : dialogCopy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
