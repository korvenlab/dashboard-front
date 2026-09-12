import { getWagooServerEnv } from "@/lib/server-env";

export type FeedbackSource = "wagoo" | "2avendas";

export type FeedbackMessageRow = {
  source: FeedbackSource;
  id: string;
  created_at: string;
  user_id: string;
  organization_id: string | null;
  user_email: string | null;
  user_full_name: string | null;
  body: string;
};

export type SupportFeedbackPayload = {
  items: FeedbackMessageRow[];
  warnings: string[];
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function parseRow(raw: unknown): Omit<FeedbackMessageRow, "source"> | null {
  const r = asRecord(raw);
  const id = typeof r.id === "string" ? r.id : null;
  const created_at = typeof r.created_at === "string" ? r.created_at : null;
  const user_id = typeof r.user_id === "string" ? r.user_id : null;
  const body = typeof r.body === "string" ? r.body : null;
  if (!id || !created_at || !user_id || !body) return null;
  return {
    id,
    created_at,
    user_id,
    organization_id:
      typeof r.organization_id === "string" ? r.organization_id : null,
    user_email: typeof r.user_email === "string" ? r.user_email : null,
    user_full_name:
      typeof r.user_full_name === "string" ? r.user_full_name : null,
    body,
  };
}

async function fetchWagooFeedbackMessages(
  baseUrl: string | undefined,
  apiKey: string | undefined,
): Promise<FeedbackMessageRow[]> {
  const base = baseUrl?.trim();
  const key = apiKey?.trim();
  if (!base || !key) {
    throw new Error(
      "Wagoo: variáveis de ambiente ausentes no servidor do dashboard.",
    );
  }

  const url = `${base.replace(/\/+$/, "")}/feedback/messages?limit=300`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
        "x-admin-secret": key,
      },
      cache: "no-store",
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Wagoo: não alcançou ${base} (${detail}).`);
  }

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  const root = asRecord(json);
  if (!res.ok || root.ok === false) {
    const msg =
      typeof root.error === "string"
        ? root.error
        : `Falha ao carregar mensagens (Wagoo, HTTP ${res.status}).`;
    throw new Error(msg);
  }

  const items = asArray(root.data);
  const rows: FeedbackMessageRow[] = [];
  for (const item of items) {
    const parsed = parseRow(item);
    if (parsed) rows.push({ ...parsed, source: "wagoo" });
  }
  return rows;
}

/**
 * Mensagens de suporte do Wagoo (2AVendas desligado por enquanto).
 * Usar só no server (HTTP `/api/dashboard/admin/feedback`).
 */
export async function listSupportFeedbackMessages(): Promise<SupportFeedbackPayload> {
  const warnings: string[] = [];
  const merged: FeedbackMessageRow[] = [];

  const wagEnv = getWagooServerEnv();
  if (!wagEnv.apiBaseUrl?.trim() || !wagEnv.metricsApiKey?.trim()) {
    warnings.push(
      "Wagoo: configure WAGOO_API_BASE_URL e WAGOO_METRICS_API_KEY ou ADMIN_API_SECRET (igual ao wag-backend) no servidor do dashboard.",
    );
  } else {
    try {
      const rows = await fetchWagooFeedbackMessages(
        wagEnv.apiBaseUrl,
        wagEnv.metricsApiKey,
      );
      merged.push(...rows);
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : String(e));
    }
  }

  merged.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { items: merged, warnings };
}

export async function deleteSupportFeedbackMessageService(input: {
  source: FeedbackSource;
  id: string;
}): Promise<{ id: string; deleted: boolean }> {
  if (input.source !== "wagoo") {
    throw new Error("2AVendas está desligado em Mensagens por enquanto.");
  }

  const wagEnv = getWagooServerEnv();
  const base = wagEnv.apiBaseUrl?.trim();
  const key = wagEnv.metricsApiKey?.trim();

  if (!base || !key) {
    throw new Error(
      "Wagoo: variáveis de ambiente ausentes no servidor do dashboard.",
    );
  }

  const url = `${base.replace(/\/+$/, "")}/feedback/messages/${encodeURIComponent(input.id)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
        "x-admin-secret": key,
      },
      cache: "no-store",
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Wagoo: não alcançou ${base} (${detail}).`);
  }

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  const root = asRecord(json);
  if (!res.ok || root.ok === false) {
    const msg =
      typeof root.error === "string"
        ? root.error
        : `Falha ao apagar mensagem (Wagoo, HTTP ${res.status}).`;
    throw new Error(msg);
  }

  const out = asRecord(root.data);
  const deleted = typeof out?.deleted === "boolean" ? out.deleted : true;
  return {
    id: typeof out?.id === "string" ? out.id : input.id,
    deleted,
  };
}
