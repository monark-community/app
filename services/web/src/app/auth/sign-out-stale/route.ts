import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEVICE_COOKIE_NAME } from "@/lib/trusted-device-cookie";

// Lands the user on /signin after their session was killed elsewhere ;
// (authed)/layout.tsx redirects here when `isCurrentDeviceTrusted` returns
// false (cookie missing, device row revoked, different user). Server
// components can't mutate cookies ; route handlers can, so the actual
// `signOut` + cookie delete has to live here.
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {
    // Best-effort. If supabase is unreachable the cookie delete below
    // still detaches the session locally ; the next request lands clean.
  });
  const cookieStore = await cookies();
  cookieStore.delete(DEVICE_COOKIE_NAME);
  // Build the redirect from the request's actual Host header, not
  // `request.url` ; the latter reads loopback in several Next.js
  // routing configurations (proxied prod, the LAN-portproxy we use
  // for phone testing) which would bounce a phone-from-LAN user to
  // a host they can't reach.
  return NextResponse.redirect(new URL("/signin", getRequestOrigin(request)), {
    headers: { "Referrer-Policy": "no-referrer" },
  });
}
