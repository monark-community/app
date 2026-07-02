import { getTranslations } from "next-intl/server";
import type { CalendarDef } from "@monark/calendar/contracts";
import { AppBar } from "@/components/app-bar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { CalendarShell } from "./calendar-shell";

export default async function CalendarPage() {
  const t = await getTranslations("calendar");

  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const api = createServerTrpcClient(sessionData.session.access_token);

  // Seed a personal calendar if the user has none yet
  await api.calendar.calendars.ensurePersonal.mutate().catch(() => null);

  const [rawCalendars, myPermissions] = await Promise.all([
    api.calendar.calendars.list.query().catch(() => []),
    api.rbac.myPermissions.query().catch(() => [] as string[]),
  ]);

  const initialCalendars: CalendarDef[] = rawCalendars.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? undefined,
    color: c.color ?? undefined,
    isPersonal: c.isPersonal,
  }));

  const perms = myPermissions as string[];
  const canManage = perms.includes("calendar.manage");
  const canDelete = perms.includes("calendar.delete") || canManage;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppBar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={t("title")}>
        <CalendarShell
          initialDate={new Date()}
          initialCalendars={initialCalendars}
          canManage={canManage}
          canDelete={canDelete}
        />
      </main>
    </div>
  );
}
