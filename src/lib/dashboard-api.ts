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
  /** Eixo dos gráficos: Wagoo e 2AVendas aceitam tipicamente até 90 dias. */
  chart_days: z.number().min(1).max(90).optional(),
});

export type DashboardQueryInput = z.infer<typeof dashboardQuerySchema>;

function record(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function mergeUpstreamWarnings(view: DashboardViewModel, rawBody: unknown): void {
  const r = record(rawBody);
  const w = r?.warnings;
  if (!Array.isArray(w) || w.length === 0) return;
  const parts = w.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (!parts.length) return;
  const tag = parts.join(" · ");
  const prev = view.meta.message?.trim();
  view.meta.message = prev ? `${prev} · ${tag}` : tag;
}

/**
 * Carrega o dashboard unificado (Wagoo via wag-backend + 2AVendas via 2A-back)
 * pelo serviço agregador `GET /dashboard` no Render.
 */
export const fetchKorvenDashboard = createServerFn({ method: "GET" })
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
      let json: unknown = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }

      if (!res.ok) {
        const r = record(json);
        const msg =
          (typeof r?.message === "string" && r.message) ||
          `Backend dashboard retornou HTTP ${res.status}.`;
        const fb = buildFallbackDashboardViewModel(filtros, msg);
        mergeUpstreamWarnings(fb, json);
        return fb;
      }

      const mapped = mapDashboardApiPayload(json, filtros);
      if (!mapped) {
        return buildFallbackDashboardViewModel(filtros, "Payload do backend em formato inesperado.");
      }
      mergeUpstreamWarnings(mapped, json);
      return mapped;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return buildFallbackDashboardViewModel(filtros, `Falha no backend dashboard: ${msg}`);
    }
  });
