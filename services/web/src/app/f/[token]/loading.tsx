import { Skeleton } from "@/components/ui/skeleton";

export default function PublicFormLoading() {
  return (
    <main className="min-h-dvh overflow-y-auto bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </main>
  );
}
