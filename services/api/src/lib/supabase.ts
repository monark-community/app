import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let admin: SupabaseClient | undefined;

// Admin client uses the secret key; keeps service-role access in one place.
export function getSupabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return admin;
}

export type VerifiedSession = {
  userId: string;
  email: string | null;
  activeOrganizationId: string | null;
};

// Verifies a bearer token by asking Supabase who it belongs to. Returns null
// on any failure (invalid/expired/wrong signature). Falls through to a null
// session so downstream handlers see an unauthenticated request.
export async function verifyAccessToken(token: string): Promise<VerifiedSession | null> {
  if (!token) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const activeOrganizationId =
    typeof metadata.active_organization_id === "string" ? metadata.active_organization_id : null;

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    activeOrganizationId,
  };
}
