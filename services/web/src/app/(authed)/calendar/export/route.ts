import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";

// A direct download link (not a tRPC call from the client) so the browser's
// `Content-Disposition: attachment` handling triggers a real file save
// instead of a JSON response ; reuses `calendar.events.exportIcs`'s own
// auth/org-resolution, same server-side-tRPC-client pattern as
// services/web/src/app/auth/confirm/route.ts.
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const api = createServerTrpcClient(sessionData.session.access_token);
  const calendarId = request.nextUrl.searchParams.get("calendarId") ?? undefined;
  const { icsText } = await api.calendar.events.exportIcs.query(
    calendarId ? { calendarId } : undefined,
  );

  return new NextResponse(icsText, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="calendar.ics"',
    },
  });
}
