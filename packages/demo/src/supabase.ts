/**
 * Browser Supabase client (auth only — data flows through the FlarePay API).
 *
 * Uses the CURRENT key system: the publishable key (sb_publishable_…), which
 * replaced the legacy anon JWT key (legacy keys are deprecated end of 2026).
 * Accepts both Vite- and Next-style env names so keys copied straight from
 * Supabase onboarding work as-is. Missing env → null, and the app falls back
 * to local-mode API-key auth.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = import.meta.env as Record<string, string | undefined>;
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const publishableKey =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_ANON_KEY; // legacy fallback

export const supabase: SupabaseClient | null =
  url && publishableKey ? createClient(url, publishableKey) : null;

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
