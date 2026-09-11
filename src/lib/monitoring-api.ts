import { protectedServerFn } from "@/lib/protected-server-fn";
import { z } from "zod";
import { getDashboardBackendEnv, getWagooServerEnv } from "@/lib/server-env";

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

export type MpWebhookMonitorEvent = {
  id: number | string;
  topic: string;
  data_id: string;
  action: string | null;
  live_mode: boolean | null;
  processed_at: string;
};

export type MpWebhookMonitorResponse = {
  ok: boolean;
  fetchedAt: string;
  summary: {
    last_24h_total: number;
    by_topic_24h: Record<string, number>;
    last_received_at: string | null;
    last_received_age_sec: number | null;
    healthy: boolean | null;
  };
  events: MpWebhookMonitorEvent[];
  runtime_signals: {
    id: string;
    status: string;
    message: string;
    timestamp: string;
  }[];
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

export const fetchUptimeMonitoring = protectedServerFn("GET")
  .inputValidator(monitoringQuerySchema)
  .handler((async (ctx: unknown): Promise<UptimeMonitoringResponse> => {
    const { data } = ctx as { data: z.infer<typeof monitoringQuerySchema> };
    const env = getDashboardBackendEnv();
    const base = env.apiBaseUrl?.trim();
    const key = env.metricsApiKey?.trim();
    if (!base) throw new Error("Monitoramento indisponível no servidor.");

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

const mpWebhookQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

/** Webhooks Mercado Pago recebidos pelo wag-backend (ops / saúde do pipeline). */
export const fetchMpWebhookMonitoring = protectedServerFn("GET")
  .inputValidator(mpWebhookQuerySchema)
  .handler((async (ctx: unknown): Promise<MpWebhookMonitorResponse> => {
    const { data } = ctx as { data: z.infer<typeof mpWebhookQuerySchema> };
    const env = getWagooServerEnv();
    const base = env.apiBaseUrl?.trim();
    const key = env.metricsApiKey?.trim();
    if (!base) throw new Error("WAGOO_API_BASE_URL ausente no Korven.");
    if (!key) throw new Error("Segredo Wagoo (ADMIN/METRICS) ausente no Korven.");

    const url = new URL(`${base.replace(/\/+$/, "")}/api/admin/mercadopago/webhooks`);
    url.searchParams.set("limit", String(data.limit ?? 40));

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
      },
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : {};
    const root = asRecord(json);
    if (!res.ok || root.ok === false) {
      const message =
        typeof root.error === "string"
          ? root.error
          : `Falha ao carregar webhooks MP (HTTP ${res.status})`;
      throw new Error(message);
    }

    const summaryRaw = asRecord(root.summary);
    const byTopicRaw = asRecord(summaryRaw.by_topic_24h);
    const byTopic: Record<string, number> = {};
    for (const [k, v] of Object.entries(byTopicRaw)) {
      if (typeof v === "number") byTopic[k] = v;
    }

    const events = asArray(root.events).map((item) => {
      const r = asRecord(item);
      return {
        id: (r.id as number | string) ?? "—",
        topic: typeof r.topic === "string" ? r.topic : "unknown",
        data_id: typeof r.data_id === "string" ? r.data_id : String(r.data_id ?? ""),
        action: typeof r.action === "string" ? r.action : null,
        live_mode: typeof r.live_mode === "boolean" ? r.live_mode : null,
        processed_at:
          typeof r.processed_at === "string" ? r.processed_at : new Date(0).toISOString(),
      };
    });

    const runtime_signals = asArray(root.runtime_signals).map((item) => {
      const r = asRecord(item);
      return {
        id: typeof r.id === "string" ? r.id : String(r.id ?? ""),
        status: typeof r.status === "string" ? r.status : "online",
        message: typeof r.message === "string" ? r.message : "",
        timestamp: typeof r.timestamp === "string" ? r.timestamp : "",
      };
    });

    return {
      ok: true,
      fetchedAt:
        typeof root.fetchedAt === "string" ? root.fetchedAt : new Date().toISOString(),
      summary: {
        last_24h_total:
          typeof summaryRaw.last_24h_total === "number" ? summaryRaw.last_24h_total : 0,
        by_topic_24h: byTopic,
        last_received_at:
          typeof summaryRaw.last_received_at === "string"
            ? summaryRaw.last_received_at
            : null,
        last_received_age_sec:
          typeof summaryRaw.last_received_age_sec === "number"
            ? summaryRaw.last_received_age_sec
            : null,
        healthy:
          typeof summaryRaw.healthy === "boolean" ? summaryRaw.healthy : null,
      },
      events,
      runtime_signals,
    };
  }) as any);
