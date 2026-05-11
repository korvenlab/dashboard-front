/**
 * Ambiente exclusivo do servidor (SSR / Node / Workers). Nunca exponha isto ao browser.
 * `WAGOO_*` → API Wagoo (wag-backend). `TWO_AVENDAS_*` → API 2AVendas (2A-back). Prefixos só histórico.
 *
 * Wagoo — chave de admin/métricas HTTP: use `WAGOO_METRICS_API_KEY` **ou** o mesmo valor de
 * `ADMIN_API_SECRET` do wag-backend (Bearer / X-API-Key), para um único segredo no Korven Dashboard.
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

function readEnvPair(
  keys: { url: string; key: string },
  cfEnv?: Record<string, string | undefined>,
): MetricsApiEnv {
  const fromProcess =
    typeof process !== "undefined" && process.env
      ? {
          apiBaseUrl: process.env[keys.url],
          metricsApiKey: process.env[keys.key],
        }
      : { apiBaseUrl: undefined, metricsApiKey: undefined };

  return {
    apiBaseUrl: stripEnvNoise(cfEnv?.[keys.url] ?? fromProcess.apiBaseUrl),
    metricsApiKey: stripEnvNoise(cfEnv?.[keys.key] ?? fromProcess.metricsApiKey),
  };
}

function firstNonEmptyTrimmed(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) {
    const cleaned = stripEnvNoise(typeof v === "string" ? v : undefined);
    if (cleaned) return cleaned;
  }
  return undefined;
}

/** Remove aspas envolventes e `\n` final (copy-paste de `.env` no Render / painéis). */
function stripEnvNoise(v: string | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  let s = String(v).trim();
  if (!s) return undefined;
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\\n$/g, "").replace(/\n$/g, "").replace(/\r$/g, "").trim();
  return s || undefined;
}

export function getWagooServerEnv(): WagooServerEnv {
  const g = globalThis as typeof globalThis & {
    cloudflare?: { env?: Record<string, string | undefined> };
  };
  const cf = g.cloudflare?.env;
  const fromProcess =
    typeof process !== "undefined" && process.env
      ? {
          apiBaseUrl: process.env.WAGOO_API_BASE_URL,
          metricsApiKey: firstNonEmptyTrimmed(
            process.env.WAGOO_METRICS_API_KEY,
            process.env.ADMIN_API_SECRET,
          ),
        }
      : { apiBaseUrl: undefined, metricsApiKey: undefined };

  return {
    apiBaseUrl: stripEnvNoise(cf?.WAGOO_API_BASE_URL ?? fromProcess.apiBaseUrl),
    metricsApiKey: firstNonEmptyTrimmed(
      cf?.WAGOO_METRICS_API_KEY,
      cf?.ADMIN_API_SECRET,
      fromProcess.metricsApiKey,
    ),
  };
}

export function getTwoAvendasServerEnv(): TwoAvendasServerEnv {
  const g = globalThis as typeof globalThis & {
    cloudflare?: { env?: Record<string, string | undefined> };
  };
  return readEnvPair(
    { url: "TWO_AVENDAS_API_BASE_URL", key: "TWO_AVENDAS_METRICS_API_KEY" },
    g.cloudflare?.env,
  );
}

export function getDashboardBackendEnv(): DashboardBackendEnv {
  const g = globalThis as typeof globalThis & {
    cloudflare?: { env?: Record<string, string | undefined> };
  };
  return readEnvPair(
    { url: "DASHBOARD_BACKEND_BASE_URL", key: "DASHBOARD_BACKEND_API_KEY" },
    g.cloudflare?.env,
  );
}
