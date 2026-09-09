import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;
let currentConfig = "";

export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export function getSupabaseBrowserClient(
  config: SupabasePublicConfig,
): SupabaseClient {
  const key = `${config.url}|${config.anonKey}`;
  if (!browserClient || currentConfig !== key) {
    browserClient = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Client-Info": "korven-dashboard-browser" } },
    });
    currentConfig = key;
  }
  return browserClient;
}
