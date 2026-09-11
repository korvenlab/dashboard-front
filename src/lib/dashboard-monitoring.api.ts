import { listMpCentralMonitoring } from "@/lib/central-service";
import { getUptimeRobotApiKey } from "@/lib/server-env";
import {
  isDashboardAuthConfigured,
  isDashboardRequestAuthenticated,
} from "@/lib/dashboard-auth.server";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
};

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Não autorizado." }), {
    status: 401,
    headers: JSON_HEADERS,
  });
}

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function jsonError(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  });
}

const UPTIME_STATUS: Record<number, string> = {
  0: "Paused",
  1: "Not checked yet",
  2: "Online",
  8: "Seems down",
  9: "Offline",
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

async function handleMpMonitoring(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(100, Math.max(1, Math.trunc(limitRaw)))
    : 40;

  const central = await listMpCentralMonitoring(limit);
  return jsonOk({
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
  });
}

async function handleUptimeMonitoring(): Promise<Response> {
  const apiKey = getUptimeRobotApiKey();
  if (!apiKey) {
    return jsonOk({
      ok: true,
      skipped: true,
      message:
        "UPTIMEROBOT_API_KEY ausente. O bloco Mercado Pago usa só Supabase.",
      fetchedAt: new Date().toISOString(),
      stat: "skipped",
      total: 0,
      monitors: [],
      raw: {},
    });
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
    return jsonError(
      `UptimeRobot respondeu JSON inválido (HTTP ${res.status})`,
      502,
    );
  }

  const root = asRecord(json);
  if (!res.ok || root.stat === "fail") {
    const message =
      typeof root.error === "object" && root.error
        ? JSON.stringify(root.error)
        : typeof root.message === "string"
          ? root.message
          : `Falha UptimeRobot (HTTP ${res.status})`;
    return jsonError(message, 502);
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
        (r.all_time_uptime_ratio as string | number | null | undefined) ?? null,
      createDatetime:
        (r.create_datetime as string | number | null | undefined) ?? null,
      logs: asArray(r.logs),
      responseTimes: asArray(r.response_times),
    };
  });

  return jsonOk({
    ok: true,
    fetchedAt: new Date().toISOString(),
    stat: typeof root.stat === "string" ? root.stat : "ok",
    total: monitors.length,
    monitors,
    raw: root,
  });
}

/**
 * Monitoramento via HTTP no mesmo runtime de `/api/dashboard/metrics`.
 * Não usar createServerFn aqui — o bundle do client acabava executando
 * getSupabaseServerClient no browser (sem SUPABASE_*).
 */
export async function handleDashboardMonitoringApi(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/dashboard/monitoring")) return null;
  if (request.method !== "GET") {
    return jsonError("method not allowed", 405);
  }

  if (
    !isDashboardAuthConfigured() ||
    !isDashboardRequestAuthenticated(request)
  ) {
    return unauthorized();
  }

  try {
    if (path === "/api/dashboard/monitoring/mp") {
      return await handleMpMonitoring(request);
    }
    if (path === "/api/dashboard/monitoring/uptime") {
      return await handleUptimeMonitoring();
    }
    return jsonError("not found", 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500);
  }
}
