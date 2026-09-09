import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerEnv } from "@/lib/server-env";

let adminClient: SupabaseClient | undefined;
let anonClient: SupabaseClient | undefined;

export function getSupabaseServerClient(
  options: { admin?: boolean } = {},
): SupabaseClient {
  const env = getSupabaseServerEnv();
  const key = options.admin ? env.serviceRoleKey : env.anonKey;
  if (!env.url || !key) {
    throw new Error(
      options.admin
        ? "Supabase central não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor."
        : "Supabase central não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY no servidor.",
    );
  }

  const existing = options.admin ? adminClient : anonClient;
  if (existing) return existing;

  const client = createClient(env.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "korven-dashboard-server" } },
  });
  if (options.admin) adminClient = client;
  else anonClient = client;
  return client;
}
