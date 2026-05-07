import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  buildFallbackDashboardViewModel,
  mapDashboardApiPayload,
  type DashboardViewModel,
} from "@/lib/dashboard-view";
import { getDashboardBackendEnv } from "@/lib/server-env";

const dashboardQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  period_days: z.number().min(1).max(366).optional(),
  chart_days: z.number().min(1).max(366).optional(),
});

export type DashboardQueryInput = z.infer<typeof dashboardQuerySchema>;

/** Consome o backend agregado (`GET /dashboard`) hospedado separadamente no Render. */
export const fetchTwoAvendasDashboard = createServerFn({ method: "GET" })
  .inputValidator(dashboardQuerySchema)
  .handler(async ({ data }): Promise<DashboardViewModel> => {
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

    const backend = getDashboardBackendEnv();
    const base = backend.apiBaseUrl?.trim();
    const key = backend.metricsApiKey?.trim();

    if (!base) {
      return buildFallbackDashboardViewModel(filtros, "Defina DASHBOARD_BACKEND_BASE_URL no servidor.");
    }

    const url = new URL(`${base.replace(/\/+$/, "")}/dashboard`);
    url.searchParams.set("period_days", String(filtros.period_days));
    url.searchParams.set("chart_days", String(filtros.chart_days));
    if (filtros.organization_id) url.searchParams.set("organization_id", filtros.organization_id);

    try {
      const res = await fetch(url.toString(), {
        headers: {
          ...(key ? { Authorization: `Bearer ${key}`, "X-API-Key": key } : {}),
          Accept: "application/json",
        },
      });
      const text = await res.text();
      const json = text ? (JSON.parse(text) as unknown) : {};
      if (!res.ok) {
        return buildFallbackDashboardViewModel(
          filtros,
          `Backend dashboard retornou HTTP ${res.status}.`,
        );
      }
      const mapped = mapDashboardApiPayload(json, filtros);
      if (!mapped) {
        return buildFallbackDashboardViewModel(filtros, "Payload do backend em formato inesperado.");
      }
      return mapped;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return buildFallbackDashboardViewModel(filtros, `Falha no backend dashboard: ${msg}`);
    }
  });
