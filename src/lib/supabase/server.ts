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
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(env.url)) {
    throw new Error(
      "SUPABASE_URL inválida: use somente https://PROJECT_REF.supabase.co.",
    );
  }
  if (options.admin && !key.startsWith("eyJ")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY inválida: use a chave JWT legada service_role, iniciada por eyJ.",
    );
  }
  if (
    !options.admin &&
    !key.startsWith("eyJ") &&
    !key.startsWith("sb_publishable_")
  ) {
    throw new Error(
      "SUPABASE_ANON_KEY inválida: use anon legada (eyJ...) ou publishable (sb_publishable_...).",
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
