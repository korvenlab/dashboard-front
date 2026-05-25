import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDashboardBackendEnv } from "@/lib/server-env";

type UptimeMonitor = {
  id: number | string | null;
  name: string;
  url: string | null;
  statusCode: number;
  status: string;
  type: number | string | null;
  interval: number | string | null;
  uptimeRatio: string | number | null;
  createDatetime: number | string | null;
  logs: unknown[];
  responseTimes: unknown[];
};

export type UptimeMonitoringResponse = {
  ok: boolean;
  fetchedAt: string;
  stat: string;
  total: number;
  monitors: UptimeMonitor[];
  raw: Record<string, unknown>;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStringOrNumberOrNull(v: unknown): string | number | null {
  return typeof v === "string" || typeof v === "number" ? v : null;
}

const monitoringQuerySchema = z.object({
  force_refresh: z.boolean().optional(),
  /** Pedido completo (logs + latência) — mais pesado na API UptimeRobot. */
  full: z.boolean().optional(),
});

export const fetchUptimeMonitoring = createServerFn({ method: "GET" })
  .inputValidator(monitoringQuerySchema)
  .handler((async (ctx: unknown): Promise<UptimeMonitoringResponse> => {
    const { data } = ctx as { data: z.infer<typeof monitoringQuerySchema> };
    const env = getDashboardBackendEnv();
    const base = env.apiBaseUrl?.trim();
    const key = env.metricsApiKey?.trim();
    if (!base) throw new Error("DASHBOARD_BACKEND_BASE_URL ausente no servidor.");

    const url = new URL(`${base.replace(/\/+$/, "")}/monitoring/uptimerobot`);
    if (data.force_refresh) url.searchParams.set("refresh", "1");
    if (data.full) url.searchParams.set("full", "1");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        ...(key ? { Authorization: `Bearer ${key}`, "X-API-Key": key } : {}),
        ...(data.full ? { "X-Korven-Uptime-Full": "1" } : {}),
      },
    });

    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : {};
    const root = asRecord(json);
    if (!res.ok || root.ok === false) {
      const message =
        typeof root.message === "string" ? root.message : `Falha ao carregar monitoramento (HTTP ${res.status})`;
      throw new Error(message);
    }

    const monitors = asArray(root.monitors).map((item) => {
      const r = asRecord(item);
      return {
        id: asStringOrNumberOrNull(r.id),
        name: typeof r.name === "string" ? r.name : "Sem nome",
        url: typeof r.url === "string" ? r.url : null,
        statusCode: typeof r.statusCode === "number" ? r.statusCode : -1,
        status: typeof r.status === "string" ? r.status : "Unknown",
        type: asStringOrNumberOrNull(r.type),
        interval: asStringOrNumberOrNull(r.interval),
        uptimeRatio: (r.uptimeRatio as string | number | null | undefined) ?? null,
        createDatetime: (r.createDatetime as string | number | null | undefined) ?? null,
        logs: asArray(r.logs),
        responseTimes: asArray(r.responseTimes),
      };
    });

    return {
      ok: true,
      fetchedAt: typeof root.fetchedAt === "string" ? root.fetchedAt : new Date().toISOString(),
      stat: typeof root.stat === "string" ? root.stat : "unknown",
      total: typeof root.total === "number" ? root.total : monitors.length,
      monitors,
      raw: asRecord(root.raw ?? root),
    };
  }) as any);
