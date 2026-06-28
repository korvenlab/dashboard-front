import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { buildFallbackDashboardViewModel, type DashboardViewModel } from "@/lib/dashboard-view";
import { fetchStripeDashboard } from "@/lib/stripe/metrics";

const dashboardQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  period_days: z.number().min(1).max(366).optional(),
  /** Eixo dos gráficos. */
  chart_days: z.number().min(1).max(90).optional(),
  /** Mantido por compatibilidade com o cliente; Stripe não usa cache local. */
  force_refresh: z.boolean().optional(),
});

export type DashboardQueryInput = z.infer<typeof dashboardQuerySchema>;

type FetchDashboardInputCtx = { data: DashboardQueryInput };

/**
 * Métricas Korven (Wagoo + 2AVENDAS) direto da Stripe — backend integrado ao dashboard-front.
 * Chamado somente ao clicar em Atualizar no topbar.
 */
export const fetchKorvenDashboard = createServerFn({ method: "GET" })
  .inputValidator(dashboardQuerySchema)
  .handler((async (ctx: unknown): Promise<DashboardViewModel> => {
    const { data } = ctx as FetchDashboardInputCtx;
    setResponseHeaders(
      new Headers({
        "Cache-Control": "private, no-store",
      }),
    );

    const filtros = {
      organization_id: data.organization_id,
      period_days: data.period_days ?? 30,
      chart_days: data.chart_days ?? 14,
    };

    const { vm, error } = await fetchStripeDashboard(filtros);

    if (!vm) {
      return buildFallbackDashboardViewModel(
        filtros,
        error ?? "Não foi possível carregar dados da Stripe.",
      );
    }

    return vm;
  }) as any);
