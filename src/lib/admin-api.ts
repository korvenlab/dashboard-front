import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getTwoAvendasServerEnv, getWagooServerEnv } from "@/lib/server-env";

export type AdminSource = "wagoo" | "2avendas";

export type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  active: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export type AdminUsersPage = {
  items: AdminUser[];
  page: number;
  limit: number;
  total: number;
};

export type AdminUserAsset = {
  id: string;
  url: string | null;
  bucket: string | null;
  path: string | null;
  name: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  size: number | null;
};

const sourceSchema = z.enum(["wagoo", "2avendas"]);

const listSchema = z.object({
  source: sourceSchema,
  search: z.string().optional(),
  page: z.number().int().min(1).max(1000).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

const byIdSchema = z.object({
  source: sourceSchema,
  id: z.string().min(1),
});

const roleSchema = byIdSchema.extend({
  role: z.string().min(1).max(64),
});

const statusSchema = byIdSchema.extend({
  active: z.boolean(),
});

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function normalizeUser(raw: unknown): AdminUser | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = asString(r.id);
  if (!id) return null;
  return {
    id,
    email: asString(r.email),
    name: asString(r.name),
    role: asString(r.role) ?? "user",
    active: asBool(r.active, true),
    createdAt: asString(r.createdAt) ?? asString(r.created_at),
    lastSignInAt: asString(r.lastSignInAt) ?? asString(r.last_sign_in_at),
  };
}

function normalizeAsset(raw: unknown): AdminUserAsset | null {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    id: asString(r.id) ?? asString(r.path) ?? crypto.randomUUID(),
    url: asString(r.url),
    bucket: asString(r.bucket),
    path: asString(r.path),
    name: asString(r.name),
    createdAt: asString(r.createdAt) ?? asString(r.created_at),
    updatedAt: asString(r.updatedAt) ?? asString(r.updated_at),
    size: typeof r.size === "number" ? r.size : null,
  };
}

function getSourceEnv(source: AdminSource): { baseUrl?: string; apiKey?: string } {
  if (source === "wagoo") {
    const env = getWagooServerEnv();
    return { baseUrl: env.apiBaseUrl, apiKey: env.metricsApiKey };
  }
  const env = getTwoAvendasServerEnv();
  return { baseUrl: env.apiBaseUrl, apiKey: env.metricsApiKey };
}

async function callAdminApi(
  source: AdminSource,
  method: "GET" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const env = getSourceEnv(source);
  const base = env.baseUrl?.trim();
  const key = env.apiKey?.trim();
  if (!base || !key) {
    throw new Error(`${source}: variáveis de ambiente ausentes`);
  }
  const url = new URL(`${base.replace(/\/+$/, "")}${path}`);
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "X-API-Key": key,
      "x-admin-secret": key,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new Error(`${source}: resposta não-JSON (${res.status})`);
  }
  const json = text ? (JSON.parse(text) as unknown) : {};
  const root = asRecord(json);
  if (!res.ok || root?.ok === false) {
    const msg = asString(root?.error) ?? `${source}: HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export const fetchAdminUsers = createServerFn({ method: "GET" })
  .inputValidator(listSchema)
  .handler((async (ctx: unknown): Promise<AdminUsersPage> => {
    const { data } = ctx as { data: z.infer<typeof listSchema> };
    const q = new URLSearchParams();
    if (data.search?.trim()) q.set("search", data.search.trim());
    q.set("page", String(data.page));
    q.set("limit", String(data.limit));
    const raw = await callAdminApi(data.source, "GET", `/api/admin/users?${q.toString()}`);
    const root = asRecord(raw);
    const payload = asRecord(root?.data) ?? {};
    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    const items = itemsRaw.map(normalizeUser).filter((x): x is AdminUser => !!x);
    return {
      items,
      page: asNumber(payload.page, data.page),
      limit: asNumber(payload.limit, data.limit),
      total: asNumber(payload.total, items.length),
    };
  }) as any);

export const fetchAdminUser = createServerFn({ method: "GET" })
  .inputValidator(byIdSchema)
  .handler((async (ctx: unknown): Promise<AdminUser | null> => {
    const { data } = ctx as { data: z.infer<typeof byIdSchema> };
    const raw = await callAdminApi(data.source, "GET", `/api/admin/users/${encodeURIComponent(data.id)}`);
    const root = asRecord(raw);
    return normalizeUser(root?.data ?? null);
  }) as any);

export const fetchAdminUserAssets = createServerFn({ method: "GET" })
  .inputValidator(byIdSchema)
  .handler((async (ctx: unknown): Promise<AdminUserAsset[]> => {
    const { data } = ctx as { data: z.infer<typeof byIdSchema> };
    const raw = await callAdminApi(data.source, "GET", `/api/admin/users/${encodeURIComponent(data.id)}/assets`);
    const root = asRecord(raw);
    const payload = asRecord(root?.data) ?? {};
    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    return itemsRaw.map(normalizeAsset).filter((x): x is AdminUserAsset => !!x);
  }) as any);

export const patchAdminUserRole = createServerFn({ method: "POST" })
  .inputValidator(roleSchema)
  .handler((async (ctx: unknown): Promise<AdminUser | null> => {
    const { data } = ctx as { data: z.infer<typeof roleSchema> };
    const raw = await callAdminApi(
      data.source,
      "PATCH",
      `/api/admin/users/${encodeURIComponent(data.id)}/role`,
      { role: data.role },
    );
    const root = asRecord(raw);
    return normalizeUser(root?.data ?? { id: data.id, role: data.role });
  }) as any);

export const patchAdminUserStatus = createServerFn({ method: "POST" })
  .inputValidator(statusSchema)
  .handler((async (ctx: unknown): Promise<AdminUser | null> => {
    const { data } = ctx as { data: z.infer<typeof statusSchema> };
    const raw = await callAdminApi(
      data.source,
      "PATCH",
      `/api/admin/users/${encodeURIComponent(data.id)}/status`,
      { active: data.active },
    );
    const root = asRecord(raw);
    return normalizeUser(root?.data ?? { id: data.id, active: data.active });
  }) as any);

export const deleteAdminUser = createServerFn({ method: "POST" })
  .inputValidator(byIdSchema)
  .handler((async (ctx: unknown): Promise<{ id: string; deleted: boolean }> => {
    const { data } = ctx as { data: z.infer<typeof byIdSchema> };
    const raw = await callAdminApi(data.source, "DELETE", `/api/admin/users/${encodeURIComponent(data.id)}`);
    const root = asRecord(raw);
    const out = asRecord(root?.data) ?? {};
    return {
      id: asString(out.id) ?? data.id,
      deleted: asBool(out.deleted, true),
    };
  }) as any);
