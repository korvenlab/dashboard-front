/** Tipos + client HTTP do monitoramento — sem imports de server/supabase. */

export type UptimeMonitor = {
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

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error("Servidor retornou resposta vazia.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Resposta inválida do servidor (não é JSON).");
  }
}

function errorMessage(json: unknown, status: number): string {
  if (
    json &&
    typeof json === "object" &&
    "error" in json &&
    typeof (json as { error: unknown }).error === "string"
  ) {
    return (json as { error: string }).error;
  }
  return `Falha no monitoramento (HTTP ${status}).`;
}

export async function fetchMpWebhookMonitoring(options?: {
  limit?: number;
}): Promise<MpWebhookMonitorResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 40));
  const res = await fetch(
    `/api/dashboard/monitoring/mp?${params.toString()}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
    },
  );
  const json = await parseJson(res);
  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) throw new Error(errorMessage(json, res.status));
  return json as MpWebhookMonitorResponse;
}

export async function fetchUptimeMonitoring(): Promise<UptimeMonitoringResponse> {
  const res = await fetch(`/api/dashboard/monitoring/uptime`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const json = await parseJson(res);
  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) throw new Error(errorMessage(json, res.status));
  return json as UptimeMonitoringResponse;
}
