import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | undefined;

// Server-side Supabase admin client (service-role key). Lazy-initialized so
// modules that don't actually call admin operations don't crash on missing
// envs at import time. Throws clearly when reached without configuration.
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client requires SUPABASE_URL + SUPABASE_SECRET_KEY in the api environment.",
    );
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
