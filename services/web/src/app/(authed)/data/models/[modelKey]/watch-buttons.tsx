"use client";

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

// Follow / Following toggles. Watching a record notifies you when it changes ;
// watching a model notifies you about any record in it. Available to any user
// who can read the record/model (not admin-only — it's a personal preference).

function WatchButton({
  watching,
  disabled,
  onToggle,
}: {
  watching: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("data.records.watch");
  return (
    <Button
      type="button"
      variant={watching ? "secondary" : "outline"}
      size="sm"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={watching}
    >
      <Bell className={cn("mr-1.5 h-4 w-4", watching && "fill-current")} aria-hidden />
      {watching ? t("following") : t("follow")}
    </Button>
  );
}

export function RecordWatchButton({ recordId }: { recordId: string }) {
  const t = useTranslations("data.records.watch");
  const utils = trpc.useUtils();
  const query = trpc.dataModels.records.isWatching.useQuery({ id: recordId });
  const mutation = trpc.dataModels.records.setWatch.useMutation({
    onSuccess: () => utils.dataModels.records.isWatching.invalidate({ id: recordId }),
    onError: (err) => toast.error(t("error") + ` (${err.message})`),
  });
  const watching = query.data?.watching ?? false;
  return (
    <WatchButton
      watching={watching}
      disabled={query.isLoading || mutation.isPending}
      onToggle={() => mutation.mutate({ id: recordId, watching: !watching })}
    />
  );
}

export function ModelWatchButton({ modelId }: { modelId: string }) {
  const t = useTranslations("data.records.watch");
  const utils = trpc.useUtils();
  const query = trpc.dataModels.models.isWatching.useQuery({ id: modelId });
  const mutation = trpc.dataModels.models.setWatch.useMutation({
    onSuccess: () => utils.dataModels.models.isWatching.invalidate({ id: modelId }),
    onError: (err) => toast.error(t("error") + ` (${err.message})`),
  });
  const watching = query.data?.watching ?? false;
  return (
    <WatchButton
      watching={watching}
      disabled={query.isLoading || mutation.isPending}
      onToggle={() => mutation.mutate({ id: modelId, watching: !watching })}
    />
  );
}
