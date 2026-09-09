import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describeSupabaseEnv, getSupabaseServerEnv } from "@/lib/server-env";

let adminClient: SupabaseClient | undefined;
let anonClient: SupabaseClient | undefined;
let adminClientKey = "";
let anonClientKey = "";

function assertAdminEnv(url: string, key: string) {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(url)) {
    throw new Error(
      "SUPABASE_URL inválida: use somente https://PROJECT_REF.supabase.co.",
    );
  }
  if (!key.startsWith("eyJ")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY inválida: use a chave JWT legada service_role, iniciada por eyJ.",
    );
  }
  const diag = describeSupabaseEnv();
  if (diag.urlMatchesKey === false) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY é de outro projeto (ref=${diag.serviceRoleRef}). A URL aponta para ${diag.urlRef}.`,
    );
  }
}

export function getSupabaseServerClient(
  options: { admin?: boolean } = {},
): SupabaseClient {
  const env = getSupabaseServerEnv();
  const key = options.admin ? env.serviceRoleKey : env.anonKey;
  if (!env.url || !key) {
    const diag = describeSupabaseEnv();
    throw new Error(
      options.admin
        ? `Supabase central não configurado no runtime (url=${diag.urlPresent}, service_role=${diag.serviceRolePresent}). Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel Production e redeploy.`
        : `Supabase central não configurado no runtime (url=${diag.urlPresent}, anon=${diag.anonPresent}). Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_PUBLISHABLE_KEY).`,
    );
  }
  if (options.admin) assertAdminEnv(env.url, key);
  if (
    !options.admin &&
    !key.startsWith("eyJ") &&
    !key.startsWith("sb_publishable_")
  ) {
    throw new Error(
      "SUPABASE_ANON_KEY inválida: use anon legada (eyJ...) ou publishable (sb_publishable_...).",
    );
  }

  const cacheKey = `${env.url}|${key.slice(0, 24)}|${key.length}`;
  if (options.admin) {
    if (adminClient && adminClientKey === cacheKey) return adminClient;
  } else if (anonClient && anonClientKey === cacheKey) {
    return anonClient;
  }

  const client = createClient(env.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "korven-dashboard-server" } },
  });
  if (options.admin) {
    adminClient = client;
    adminClientKey = cacheKey;
  } else {
    anonClient = client;
    anonClientKey = cacheKey;
  }
  return client;
}
