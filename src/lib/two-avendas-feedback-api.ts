import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getTwoAvendasServerEnv } from "@/lib/server-env";

export type FeedbackMessageRow = {
  id: string;
  created_at: string;
  user_id: string;
  organization_id: string | null;
  user_email: string | null;
  user_full_name: string | null;
  body: string;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

const feedbackMessageIdSchema = z.object({ id: z.string().uuid() });

function parseRow(raw: unknown): FeedbackMessageRow | null {
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
    organization_id: typeof r.organization_id === "string" ? r.organization_id : null,
    user_email: typeof r.user_email === "string" ? r.user_email : null,
    user_full_name: typeof r.user_full_name === "string" ? r.user_full_name : null,
    body,
  };
}

/**
 * Lista mensagens enviadas pelo app 2AVendas (`feedback_messages`).
 * Requer `TWO_AVENDAS_API_BASE_URL` + `TWO_AVENDAS_METRICS_API_KEY` (mesma chave que `/metrics`).
 */
export const fetchTwoAvendasFeedbackMessages = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async (): Promise<FeedbackMessageRow[]> => {
    const env = getTwoAvendasServerEnv();
    const base = env.apiBaseUrl?.trim();
    const key = env.metricsApiKey?.trim();
    if (!base) {
      throw new Error(
        "Configure TWO_AVENDAS_API_BASE_URL no servidor do dashboard para ler mensagens.",
      );
    }
    if (!key) {
      throw new Error(
        "Configure TWO_AVENDAS_METRICS_API_KEY no servidor (mesma chave do 2A-back /metrics).",
      );
    }

    const url = `${base.replace(/\/+$/, "")}/feedback/messages?limit=300`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
      },
    });

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
          : `Falha ao carregar mensagens (HTTP ${res.status}).`;
      throw new Error(msg);
    }

    const items = asArray(root.data);
    const rows: FeedbackMessageRow[] = [];
    for (const item of items) {
      const parsed = parseRow(item);
      if (parsed) rows.push(parsed);
    }
    return rows;
  });

/**
 * Remove uma linha de `feedback_messages` (mesma API key que `/metrics`).
 */
export const deleteTwoAvendasFeedbackMessage = createServerFn({ method: "POST" })
  .inputValidator(feedbackMessageIdSchema)
  .handler((async (ctx: unknown): Promise<{ id: string; deleted: boolean }> => {
    const { data } = ctx as { data: z.infer<typeof feedbackMessageIdSchema> };
    const env = getTwoAvendasServerEnv();
    const base = env.apiBaseUrl?.trim();
    const key = env.metricsApiKey?.trim();
    if (!base) {
      throw new Error(
        "Configure TWO_AVENDAS_API_BASE_URL no servidor do dashboard para apagar mensagens.",
      );
    }
    if (!key) {
      throw new Error(
        "Configure TWO_AVENDAS_METRICS_API_KEY no servidor (mesma chave do 2A-back /metrics).",
      );
    }

    const url = `${base.replace(/\/+$/, "")}/feedback/messages/${encodeURIComponent(data.id)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
      },
    });

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
          : `Falha ao apagar mensagem (HTTP ${res.status}).`;
      throw new Error(msg);
    }

    const out = asRecord(root.data);
    const deleted = typeof out?.deleted === "boolean" ? out.deleted : true;
    return { id: typeof out?.id === "string" ? out.id : data.id, deleted };
  }) as any);
