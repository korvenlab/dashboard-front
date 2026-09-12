import type {
  Notification,
  UnifiedUserDetails,
  UnifiedUsersPage,
} from "@/lib/supabase/types";

async function readJson(res: Response): Promise<unknown> {
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

async function centralFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const json = await readJson(res);
  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) {
    const message =
      json &&
      typeof json === "object" &&
      "error" in json &&
      typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Falha na API central (${res.status}).`;
    throw new Error(message);
  }
  return json as T;
}

export type CentralUsersQuery = {
  search?: string;
  product?: string;
  status?: string;
  page?: number;
  limit?: number;
};

export async function fetchCentralHealth() {
  return centralFetch<{
    ok: boolean;
    source: string;
    routes: Record<string, string>;
    env: {
      urlPresent: boolean;
      url: string | null;
      urlRef: string | null;
      anonPresent: boolean;
      serviceRolePresent: boolean;
      serviceRoleLen: number;
      serviceRoleRef: string | null;
      serviceRoleRole: string | null;
      urlMatchesKey: boolean | null;
    };
  }>("/api/dashboard/central/health");
}

export async function fetchUnifiedUsersHttp(
  query: CentralUsersQuery,
): Promise<UnifiedUsersPage> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.product) params.set("product", query.product);
  if (query.status) params.set("status", query.status);
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? 25));
  return centralFetch(`/api/dashboard/central/users?${params.toString()}`);
}

export async function fetchUnifiedUserDetailsHttp(
  userId: string,
): Promise<UnifiedUserDetails> {
  return centralFetch(
    `/api/dashboard/central/users/${encodeURIComponent(userId)}`,
  );
}

export async function executeCentralAdminCommandHttp(input: {
  userId: string;
  productSlug: "wagoo" | "2avendas";
  action:
    "role.set" | "status.set" | "plan.set" | "access.grant" | "user.delete";
  params?: Record<string, unknown>;
  reason?: string;
}) {
  return centralFetch<{ ok: boolean; commandId?: string; message?: string }>(
    "/api/dashboard/central/command",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function createCentralAccessLinkHttp(input: {
  userId: string;
  productSlug: string;
}) {
  return centralFetch<{ url: string; expiresAt: string | null }>(
    "/api/dashboard/central/access-link",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function fetchNotificationsHttp(
  includeArchived = false,
): Promise<Notification[]> {
  const q = includeArchived ? "?includeArchived=true" : "";
  return centralFetch(`/api/dashboard/central/notifications${q}`);
}

export type CentralPaymentHttpRow = {
  id: string;
  provider: "mercadopago" | "stripe" | "unknown";
  event_type: string | null;
  status: string | null;
  amount_cents: number | null;
  currency: string | null;
  plan: string | null;
  kind: string | null;
  object_id: string | null;
  created_at: string;
};

export async function fetchRecentPaymentsHttp(input?: {
  product?: "wagoo" | "2avendas";
  limit?: number;
}): Promise<CentralPaymentHttpRow[]> {
  const params = new URLSearchParams();
  if (input?.product) params.set("product", input.product);
  params.set("limit", String(input?.limit ?? 40));
  return centralFetch(`/api/dashboard/central/payments?${params.toString()}`);
}

export type CentralMpMonitoringResponse = {
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
  events: {
    id: number | string;
    topic: string;
    data_id: string;
    action: string | null;
    live_mode: boolean | null;
    processed_at: string;
    kind?: string | null;
    source?: "ingest" | "notification";
  }[];
  runtime_signals: {
    id: string;
    status: string;
    message: string;
    timestamp: string;
  }[];
};

export async function fetchCentralMpMonitoringHttp(options?: {
  limit?: number;
}): Promise<CentralMpMonitoringResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 40));
  return centralFetch(
    `/api/dashboard/central/mp-monitoring?${params.toString()}`,
  );
}

export type CentralUptimeMonitor = {
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

export type CentralUptimeResponse = {
  ok: boolean;
  fetchedAt: string;
  stat: string;
  total: number;
  monitors: CentralUptimeMonitor[];
  raw: Record<string, unknown>;
  skipped?: boolean;
  message?: string;
};

export async function fetchCentralUptimeHttp(): Promise<CentralUptimeResponse> {
  return centralFetch("/api/dashboard/central/uptime");
}

export type CentralDeployRow = {
  provider: "vercel" | "render";
  project: string;
  id: string;
  status: string;
  healthy: boolean | null;
  target: string | null;
  url: string | null;
  commit: string | null;
  createdAt: string | null;
  inspectorUrl: string | null;
};

export type CentralDeploysResponse = {
  ok: boolean;
  fetchedAt: string;
  vercel: {
    skipped: boolean;
    message?: string;
    items: CentralDeployRow[];
  };
  render: {
    skipped: boolean;
    message?: string;
    items: CentralDeployRow[];
  };
};

export async function fetchCentralDeploysHttp(): Promise<CentralDeploysResponse> {
  return centralFetch("/api/dashboard/central/deploys");
}

export async function mutateNotificationHttp(input: {
  id: string;
  action: "read" | "archive";
}) {
  return centralFetch<{ ok: true }>("/api/dashboard/central/notifications", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchSupabasePublicConfigHttp() {
  return centralFetch<{ url: string; anonKey: string }>(
    "/api/dashboard/central/public-config",
  );
}

export async function reconcileCentralHttp(input?: {
  product?: "wagoo" | "2avendas";
}) {
  return centralFetch<{
    ok: true;
    results: {
      product: string;
      seen: number;
      upserted: number;
      errors: string[];
    }[];
    unifiedUsers: number;
  }>("/api/dashboard/central/reconcile", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}
