import type { DashboardViewModel } from "@/lib/dashboard-view";

export type DashboardMetricsQuery = {
  organization_id?: string;
  period_days?: number;
  chart_days?: number;
};

export async function fetchDashboardMetrics(
  query: DashboardMetricsQuery,
): Promise<DashboardViewModel> {
  const params = new URLSearchParams();
  if (query.organization_id) params.set("organization_id", query.organization_id);
  params.set("period_days", String(query.period_days ?? 30));
  params.set("chart_days", String(query.chart_days ?? 14));

  const res = await fetch(`/api/dashboard/metrics?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" },
  });

  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const err =
      json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : "Falha ao carregar métricas.";
    throw new Error(err);
  }

  return json as DashboardViewModel;
}
