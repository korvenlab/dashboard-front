import { z } from "zod";
import { buildFallbackDashboardViewModel, type DashboardViewModel } from "@/lib/dashboard-view";
import {
  isDashboardAuthConfigured,
  isDashboardRequestAuthenticated,
} from "@/lib/dashboard-auth.server";
import { fetchStripeDashboard } from "@/lib/stripe/metrics";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
};

const metricsQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  period_days: z.coerce.number().min(1).max(366).optional(),
  chart_days: z.coerce.number().min(1).max(90).optional(),
});

export async function handleDashboardMetricsApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/dashboard/metrics" || request.method !== "GET") {
    return null;
  }

  if (isDashboardAuthConfigured() && !isDashboardRequestAuthenticated(request)) {
    return new Response(JSON.stringify({ error: "Não autorizado." }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const parsed = metricsQuerySchema.safeParse({
    organization_id: url.searchParams.get("organization_id") ?? undefined,
    period_days: url.searchParams.get("period_days") ?? 30,
    chart_days: url.searchParams.get("chart_days") ?? 14,
  });

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Parâmetros inválidos." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const filtros = {
    organization_id: parsed.data.organization_id,
    period_days: parsed.data.period_days ?? 30,
    chart_days: parsed.data.chart_days ?? 14,
  };

  const stripeTimeoutMs = 50_000;
  const { vm, error } = await Promise.race([
    fetchStripeDashboard(filtros),
    new Promise<{ vm: null; error: string }>((resolve) => {
      setTimeout(
        () => resolve({ vm: null, error: "Stripe demorou demais. Tente um período menor." }),
        stripeTimeoutMs,
      );
    }),
  ]);
  const body: DashboardViewModel =
    vm ?? buildFallbackDashboardViewModel(filtros, error ?? "Não foi possível carregar dados da Stripe.");

  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
}
