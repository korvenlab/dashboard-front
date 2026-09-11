import {
  isDashboardAuthConfigured,
  isDashboardRequestAuthenticated,
} from "@/lib/dashboard-auth.server";
import { describeSupabaseEnv, envGet } from "@/lib/server-env";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
};

/**
 * Diagnóstico autenticado: quais envs o runtime realmente enxerga (só booleans).
 * GET /api/dashboard/env-diag
 */
export async function handleDashboardEnvDiagApi(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/dashboard/env-diag" || request.method !== "GET") {
    return null;
  }

  if (
    !isDashboardAuthConfigured() ||
    !isDashboardRequestAuthenticated(request)
  ) {
    return new Response(JSON.stringify({ error: "Não autorizado." }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const pe =
    typeof process !== "undefined" && process.env
      ? process.env
      : ({} as NodeJS.ProcessEnv);
  const cf = (
    globalThis as { cloudflare?: { env?: Record<string, string | undefined> } }
  ).cloudflare?.env;

  const watch = [
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "UPTIMEROBOT_API_KEY",
    "KORVEN_DASHBOARD_USER",
    "KORVEN_DASHBOARD_PASSWORD",
  ] as const;

  const presence = Object.fromEntries(
    watch.map((key) => [
      key,
      {
        processEnv: Boolean(pe[key]?.trim()),
        envGet: Boolean(envGet(key)),
        cloudflare: Boolean(cf?.[key]?.trim()),
        processLen: pe[key]?.trim().length ?? 0,
        envGetLen: envGet(key)?.length ?? 0,
      },
    ]),
  );

  return new Response(
    JSON.stringify({
      ok: true,
      processEnvCount: Object.keys(pe).length,
      cloudflareEnvCount: cf ? Object.keys(cf).length : 0,
      supabase: describeSupabaseEnv(),
      presence,
      processEnvKeysSample: Object.keys(pe)
        .filter((k) => /SUPABASE|KORVEN|UPTIME|VITE_|VERCEL|NITRO/i.test(k))
        .sort(),
    }),
    { status: 200, headers: JSON_HEADERS },
  );
}
