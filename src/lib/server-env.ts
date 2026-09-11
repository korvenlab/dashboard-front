/**
 * Ambiente exclusivo do servidor (SSR / Node / Workers). Nunca exponha isto ao browser.
 * `WAGOO_*` → API Wagoo (wag-backend). `TWO_AVENDAS_*` → API 2AVendas (2A-back).
 *
 * Wagoo — chave de admin/métricas HTTP: use `WAGOO_METRICS_API_KEY` **ou** o mesmo valor de
 * `ADMIN_API_SECRET` do wag-backend (Bearer / X-API-Key).
 */
export type MetricsApiEnv = {
  apiBaseUrl: string | undefined;
  /** Bearer enviado ao wag-backend; preenchido por `WAGOO_METRICS_API_KEY` ou `ADMIN_API_SECRET`. */
  metricsApiKey: string | undefined;
};

/** Credenciais da API 2AVendas (`TWO_AVENDAS_*`). */
export type TwoAvendasServerEnv = MetricsApiEnv;
export type WagooServerEnv = MetricsApiEnv;
export type DashboardBackendEnv = MetricsApiEnv;

export type StripeServerEnv = {
  secretKey: string | undefined;
  wagooPriceIds: string[];
  avendasPriceIds: string[];
};

export type SupabaseServerEnv = {
  url: string | undefined;
  anonKey: string | undefined;
  /** Nunca deve ser serializada ou importada por código de browser. */
  serviceRoleKey: string | undefined;
};

/** Remove aspas envolventes e `\n` final (copy-paste de `.env` / painéis). */
export function stripEnvNoise(v: string | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  let s = String(v).trim();
  if (!s) return undefined;
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  // Tolera o conteúdo completo de uma linha `.env` colado por engano no
  // campo Value da Vercel, por exemplo `SUPABASE_URL=https://...`.
  const assignment = s.match(/^[A-Z][A-Z0-9_]*=([\s\S]*)$/);
  if (assignment) s = assignment[1].trim();
  s = s.replace(/\\n$/g, "").replace(/\n$/g, "").replace(/\r$/g, "").trim();
  return s || undefined;
}

/**
 * Leitura dinâmica de env. Nunca use `process.env.NOME` literal — o bundler Vite/Nitro
 * pode substituir por string vazia no build e quebrar o runtime.
 */
export function envGet(name: string): string | undefined {
  const g = globalThis as typeof globalThis & {
    cloudflare?: { env?: Record<string, string | undefined> };
  };
  const fromCf = stripEnvNoise(g.cloudflare?.env?.[name]);
  if (fromCf) return fromCf;
  if (typeof process === "undefined" || !process.env) return undefined;
  return stripEnvNoise(process.env[name]);
}

function firstNonEmptyTrimmed(
  ...vals: (string | undefined)[]
): string | undefined {
  for (const v of vals) {
    const cleaned = stripEnvNoise(typeof v === "string" ? v : undefined);
    if (cleaned) return cleaned;
  }
  return undefined;
}

function readEnvPair(keys: { url: string; key: string }): MetricsApiEnv {
  return {
    apiBaseUrl: envGet(keys.url),
    metricsApiKey: envGet(keys.key),
  };
}

export function getWagooServerEnv(): WagooServerEnv {
  return {
    // Produto Wagoo (wag-backend) — admin/reconcile. O /monitoramento MP usa só Supabase.
    apiBaseUrl: firstNonEmptyTrimmed(
      envGet("WAGOO_API_BASE_URL"),
      envGet("WAGOO_BACKEND_URL"),
      envGet("WAG_BACKEND_URL"),
    ),
    metricsApiKey: firstNonEmptyTrimmed(
      envGet("WAGOO_METRICS_API_KEY"),
      envGet("METRICS_API_KEY"),
      envGet("ADMIN_API_SECRET"),
      envGet("WAGOO_API_SECRET"),
      envGet("DASHBOARD_BACKEND_API_KEY"),
    ),
  };
}

export function getTwoAvendasServerEnv(): TwoAvendasServerEnv {
  const legacy = readEnvPair({
    url: "TWO_AVENDAS_API_BASE_URL",
    key: "TWO_AVENDAS_METRICS_API_KEY",
  });
  const dashboard = readEnvPair({
    url: "DASHBOARD_BACKEND_BASE_URL",
    key: "DASHBOARD_BACKEND_API_KEY",
  });

  return {
    apiBaseUrl: firstNonEmptyTrimmed(legacy.apiBaseUrl, dashboard.apiBaseUrl),
    metricsApiKey: firstNonEmptyTrimmed(
      legacy.metricsApiKey,
      dashboard.metricsApiKey,
      envGet("METRICS_API_KEY"),
    ),
  };
}

/** Segredo para `POST /api/billing/organization-access-link` (header `X-Billing-Admin-Secret`). */
export function getTwoAvendasBillingAdminSecret(): string | undefined {
  return firstNonEmptyTrimmed(
    envGet("TWO_AVENDAS_BILLING_ADMIN_SECRET"),
    getTwoAvendasServerEnv().metricsApiKey,
  );
}

export function getDashboardBackendEnv(): DashboardBackendEnv {
  return readEnvPair({
    url: "DASHBOARD_BACKEND_BASE_URL",
    key: "DASHBOARD_BACKEND_API_KEY",
  });
}

function decodeJwtPayload(
  token: string,
): { ref?: string; role?: string } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part, "base64url").toString("utf8");
    return JSON.parse(json) as { ref?: string; role?: string };
  } catch {
    return null;
  }
}

/** Configuração canônica do banco central. */
export function getSupabaseServerEnv(): SupabaseServerEnv {
  const url = firstNonEmptyTrimmed(
    envGet("SUPABASE_URL"),
    envGet("VITE_SUPABASE_URL"),
  )?.replace(/\/+$/, "");

  const anonKey = firstNonEmptyTrimmed(
    envGet("SUPABASE_ANON_KEY"),
    envGet("SUPABASE_PUBLISHABLE_KEY"),
    envGet("VITE_SUPABASE_PUBLISHABLE_KEY"),
  )?.replace(/\s+/g, "");

  const serviceRoleKey = firstNonEmptyTrimmed(
    envGet("SUPABASE_SERVICE_ROLE_KEY"),
  )?.replace(/\s+/g, "");

  return { url, anonKey, serviceRoleKey };
}

export function describeSupabaseEnv(): {
  urlPresent: boolean;
  url: string | null;
  urlRef: string | null;
  anonPresent: boolean;
  serviceRolePresent: boolean;
  serviceRoleLen: number;
  serviceRoleRef: string | null;
  serviceRoleRole: string | null;
  urlMatchesKey: boolean | null;
} {
  const env = getSupabaseServerEnv();
  const urlRef =
    env.url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1] ?? null;
  const payload = env.serviceRoleKey
    ? decodeJwtPayload(env.serviceRoleKey)
    : null;
  const serviceRoleRef = typeof payload?.ref === "string" ? payload.ref : null;
  return {
    urlPresent: Boolean(env.url),
    url: env.url ?? null,
    urlRef,
    anonPresent: Boolean(env.anonKey),
    serviceRolePresent: Boolean(env.serviceRoleKey),
    serviceRoleLen: env.serviceRoleKey?.length ?? 0,
    serviceRoleRef,
    serviceRoleRole: typeof payload?.role === "string" ? payload.role : null,
    urlMatchesKey: urlRef && serviceRoleRef ? urlRef === serviceRoleRef : null,
  };
}

function parseCsvIds(raw: string | undefined): string[] {
  const cleaned = stripEnvNoise(raw);
  if (!cleaned) return [];
  return cleaned
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Chave Stripe para métricas do dashboard (server-only). */
export function getStripeServerEnv(): StripeServerEnv {
  return {
    secretKey: envGet("STRIPE_SECRET_KEY"),
    wagooPriceIds: parseCsvIds(envGet("STRIPE_WAGOO_PRICE_IDS")),
    avendasPriceIds: parseCsvIds(envGet("STRIPE_2AVENDAS_PRICE_IDS")),
  };
}
