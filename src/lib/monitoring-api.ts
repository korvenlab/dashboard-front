import { protectedServerFn } from "@/lib/protected-server-fn";
import { z } from "zod";
import { listMpCentralMonitoring } from "@/lib/central-service";
import { getUptimeRobotApiKey } from "@/lib/server-env";

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
  /** true quando UPTIMEROBOT_API_KEY não está no ambiente — não é erro. */
  skipped?: boolean;
  message?: string;
};

export type MpWebhookMonitorEvent = {
  id: number | string;
  topic: string;
  data_id: string;
  action: string | null;
  live_mode: boolean | null;
  processed_at: string;
  kind?: string | null;
  source?: "ingest" | "notification";
};

export type MpWebhookMonitorResponse = {
  ok: boolean;
  fetchedAt: string;
  /** Sempre Supabase central no Korven. */
  source: "supabase";
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
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStringOrNumberOrNull(v: unknown): string | number | null {
  return typeof v === "string" || typeof v === "number" ? v : null;
}

const UPTIME_STATUS: Record<number, string> = {
  0: "Paused",
  1: "Not checked yet",
  2: "Online",
  8: "Seems down",
  9: "Offline",
};

const monitoringQuerySchema = z.object({
  force_refresh: z.boolean().optional(),
  full: z.boolean().optional(),
});

/**
 * UptimeRobot direto na API oficial — sem backend Render / DASHBOARD_BACKEND_*.
 * Requer UPTIMEROBOT_API_KEY no projeto Vercel `dashboard-front`.
 */
export const fetchUptimeMonitoring = protectedServerFn("GET")
  .inputValidator(monitoringQuerySchema)
  .handler((async (_ctx: unknown): Promise<UptimeMonitoringResponse> => {
    const apiKey = getUptimeRobotApiKey();
    if (!apiKey) {
      return {
        ok: true,
        skipped: true,
        message:
          "UPTIMEROBOT_API_KEY ausente. O bloco Mercado Pago usa só Supabase.",
        fetchedAt: new Date().toISOString(),
        stat: "skipped",
        total: 0,
        monitors: [],
        raw: {},
      };
    }

    const body = new URLSearchParams({
      api_key: apiKey,
      format: "json",
      logs: "1",
      response_times: "1",
      response_times_limit: "5",
    });

    const res = await fetch("https://api.uptimerobot.com/v2/getMonitors", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body,
    });

    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`UptimeRobot respondeu JSON inválido (HTTP ${res.status})`);
    }
    const root = asRecord(json);
    if (!res.ok || root.stat === "fail") {
      const message =
        typeof root.error === "object" && root.error
          ? JSON.stringify(root.error)
          : typeof root.message === "string"
            ? root.message
            : `Falha UptimeRobot (HTTP ${res.status})`;
      throw new Error(message);
    }

    const monitors = asArray(root.monitors).map((item) => {
      const r = asRecord(item);
      const statusCode = typeof r.status === "number" ? r.status : -1;
      return {
        id: asStringOrNumberOrNull(r.id),
        name: typeof r.friendly_name === "string" ? r.friendly_name : "Sem nome",
        url: typeof r.url === "string" ? r.url : null,
        statusCode,
        status: UPTIME_STATUS[statusCode] ?? String(statusCode),
        type: asStringOrNumberOrNull(r.type),
        interval: asStringOrNumberOrNull(r.interval),
        uptimeRatio:
          (r.all_time_uptime_ratio as string | number | null | undefined) ??
          null,
        createDatetime:
          (r.create_datetime as string | number | null | undefined) ?? null,
        logs: asArray(r.logs),
        responseTimes: asArray(r.response_times),
      };
    });

    return {
      ok: true,
      fetchedAt: new Date().toISOString(),
      stat: typeof root.stat === "string" ? root.stat : "ok",
      total: monitors.length,
      monitors,
      raw: root,
    };
  }) as any);

const mpWebhookQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * Monitoramento MP no Korven = só Supabase central
 * (payment_events, user_activity_events, notifications via Edge ingest).
 */
export const fetchMpWebhookMonitoring = protectedServerFn("GET")
  .inputValidator(mpWebhookQuerySchema)
  .handler((async (ctx: unknown): Promise<MpWebhookMonitorResponse> => {
    const { data } = ctx as { data: z.infer<typeof mpWebhookQuerySchema> };
    const limit = data.limit ?? 40;
    const central = await listMpCentralMonitoring(limit);
    return {
      ok: true,
      fetchedAt: new Date().toISOString(),
      source: "supabase",
      summary: central.summary,
      events: central.events.map((e) => ({
        id: e.id,
        topic: e.topic,
        data_id: e.data_id,
        action: e.action,
        live_mode: e.live_mode,
        processed_at: e.processed_at,
        kind: e.kind,
        source: e.source,
      })),
      runtime_signals: central.runtime_signals,
    };
  }) as any);
