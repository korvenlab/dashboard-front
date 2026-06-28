import type { DashboardViewModel } from "@/lib/dashboard-view";

export type DashboardMetricsQuery = {
  organization_id?: string;
  period_days?: number;
  chart_days?: number;
};

const METRICS_TIMEOUT_MS = 55_000;

function parseMetricsJson(text: string): unknown {
  if (!text.trim()) {
    throw new Error("Servidor retornou resposta vazia ao buscar métricas.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      "Resposta inválida do servidor (não é JSON). O deploy pode estar desatualizado ou a requisição expirou.",
    );
  }
}

function assertDashboardViewModel(json: unknown): DashboardViewModel {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Formato de métricas inválido.");
  }
  const record = json as Record<string, unknown>;
  if (!record.meta || typeof record.meta !== "object" || !Array.isArray(record.kpis)) {
    throw new Error("Resposta de métricas incompleta.");
  }
  return json as DashboardViewModel;
}

export async function fetchDashboardMetrics(
  query: DashboardMetricsQuery,
): Promise<DashboardViewModel> {
  const params = new URLSearchParams();
  if (query.organization_id) params.set("organization_id", query.organization_id);
  params.set("period_days", String(query.period_days ?? 30));
  params.set("chart_days", String(query.chart_days ?? 14));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METRICS_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`/api/dashboard/metrics?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Tempo esgotado ao buscar métricas na Stripe. Tente novamente.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const text = await res.text();
  const json = parseMetricsJson(text);

  if (!res.ok) {
    const err =
      json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Falha ao carregar métricas (${res.status}).`;
    throw new Error(err);
  }

  return assertDashboardViewModel(json);
}
