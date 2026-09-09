import { z } from "zod";
import {
  buildFallbackDashboardViewModel,
  mapDashboardApiPayload,
  type DashboardViewModel,
} from "@/lib/dashboard-view";
import {
  isDashboardAuthConfigured,
  isDashboardRequestAuthenticated,
} from "@/lib/dashboard-auth.server";
import { fetchStripeDashboard } from "@/lib/stripe/metrics";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
};

const metricsQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  product_slug: z.string().max(80).optional(),
  period_days: z.coerce.number().min(1).max(366).optional(),
  chart_days: z.coerce.number().min(1).max(90).optional(),
});

async function fetchCentralMetrics(
  filtros: DashboardViewModel["meta"]["filtros"],
  productSlug?: string,
): Promise<DashboardViewModel> {
  const periodEnd = new Date();
  const periodStart = new Date(
    periodEnd.getTime() - filtros.period_days * 86_400_000,
  );
  const { data, error } = await getSupabaseServerClient({ admin: true }).rpc(
    "dashboard_metrics",
    {
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      product_slug: productSlug || null,
    },
  );
  if (error) throw new Error(error.message);
  const payload = Array.isArray(data) && data.length === 1 ? data[0] : data;
  const vm = mapDashboardApiPayload(payload, filtros);
  if (!vm)
    throw new Error(
      "A RPC dashboard_metrics retornou um contrato vazio ou incompatível.",
    );
  vm.meta.source = "supabase";
  vm.meta.message = "Fonte: Supabase central · RPC dashboard_metrics";
  return vm;
}

export async function handleDashboardMetricsApi(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/dashboard/metrics" || request.method !== "GET") {
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

  const parsed = metricsQuerySchema.safeParse({
    organization_id: url.searchParams.get("organization_id") ?? undefined,
    product_slug: url.searchParams.get("product_slug") ?? undefined,
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

  try {
    const central = await fetchCentralMetrics(
      filtros,
      parsed.data.product_slug,
    );
    return new Response(JSON.stringify(central), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (centralError) {
    const centralMessage =
      centralError instanceof Error
        ? centralError.message
        : String(centralError);

    const stripeTimeoutMs = 50_000;
    const { vm, error } = await Promise.race([
      fetchStripeDashboard(filtros),
      new Promise<{ vm: null; error: string }>((resolve) => {
        setTimeout(
          () =>
            resolve({
              vm: null,
              error: "Stripe demorou demais. Tente um período menor.",
            }),
          stripeTimeoutMs,
        );
      }),
    ]);
    const body: DashboardViewModel =
      vm ??
      buildFallbackDashboardViewModel(
        filtros,
        error ?? "Não foi possível carregar dados da Stripe.",
      );
    if (vm) {
      body.meta.source = "stripe-legacy";
      body.meta.message = `Stripe legado (fallback). Central falhou: ${centralMessage}`;
    } else {
      body.meta.message = `Central: ${centralMessage} · Stripe: ${body.meta.message ?? "indisponível"}`;
    }

    // Expoe o erro da central também no campo que a UI trata como banner crítico.
    if (/não configurado|Invalid API key|outro projeto/i.test(centralMessage)) {
      body.meta.source = "fallback";
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }
}
