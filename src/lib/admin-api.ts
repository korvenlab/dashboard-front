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
  /** Wagoo: espelha `profiles.has_paid` quando o backend expõe o campo. */
  hasPaid?: boolean;
  /** Wagoo: acesso efetivo (Stripe ou cortesia). */
  hasAccess?: boolean;
  complimentary_access_until?: string | null;
  /** Wagoo: existe resgate de link promocional (`wagoo_promo_redemptions`). */
  complimentaryViaLink?: boolean;
  /** Wagoo: resumo de onde vem o acesso (Stripe, link, base). */
  accessOriginSummary?: string;
  /** Wagoo: texto longo (tooltip) explicando os canais. */
  accessOriginDetail?: string;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export type AdminUsersPage = {
  items: AdminUser[];
  page: number;
  limit: number;
  total: number;
};

export type AdminRoleOption = {
  value: string;
  label: string;
  description?: string | null;
  permissions?: string[];
};

export type AdminRolesResult = {
  items: AdminRoleOption[];
  fromFallback: boolean;
  fallbackReason?: string;
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

const wagooHasPaidSchema = z.object({
  source: z.literal("wagoo"),
  id: z.string().min(1),
  hasPaid: z.boolean(),
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

/** Backend pode devolver `error` como string ou objeto `{ message, detail }`. */
function extractApiErrorMessage(root: Record<string, unknown> | undefined, source: AdminSource, httpStatus: number): string {
  const err = root?.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  const errRec = asRecord(err);
  if (errRec) {
    const nested =
      asString(errRec.message) ??
      asString(errRec.error) ??
      asString(errRec.detail) ??
      asString(errRec.description);
    if (nested?.trim()) return nested.trim();
    try {
      return `${source}: ${JSON.stringify(errRec)}`;
    } catch {
      /* ignore */
    }
  }
  const code = asString(root?.code);
  const msg = asString(root?.message);
  const parts = [code, msg].filter((x): x is string => !!x?.trim());
  if (parts.length) return parts.join(" — ");
  return `${source}: HTTP ${httpStatus}`;
}

function stringifyCaughtUnknown(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const m = asString(o.message) ?? asString(o.error) ?? asString(o.detail);
    if (m?.trim()) return m.trim();
    try {
      return JSON.stringify(e);
    } catch {
      return "erro desconhecido";
    }
  }
  return String(e);
}

function isAdminRoleOption(v: unknown): v is AdminRoleOption {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<AdminRoleOption>;
  return typeof r.value === "string" && typeof r.label === "string";
}

/** Aceita boolean, 0/1, bigint, texto PT/EN e valores vindos do Postgres via JSON. */
function coerceHasPaid(v: unknown): boolean | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "bigint") return v !== 0n;
  if (typeof v === "number" && Number.isFinite(v)) return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "t", "sim", "pago", "verdadeiro", "ligado", "ativo", "on"].includes(s))
      return true;
    if (["false", "0", "no", "f", "não", "nao", "falso", "desligado", "inativo", "off"].includes(s))
      return false;
  }
  return undefined;
}

/**
 * Coluna `profiles.has_paid` no Wagoo: o wag-backend pode enviar no topo, em `profile`,
 * em `profiles[0]` (join Supabase) ou como `hasPaid` / `has_paid`.
 */
function extractHasPaidFromUserPayload(raw: Record<string, unknown>): boolean | undefined {
  const profile = asRecord(raw.profile);
  const profilesArr = Array.isArray(raw.profiles) ? raw.profiles : null;
  const firstProfile = profilesArr?.length ? asRecord(profilesArr[0]) : undefined;

  /** Preferir campos no topo da API Korven; `profile` aninhado por último (evita `false` obsoleto). */
  const candidates = [
    raw.hasPaid,
    raw.has_paid,
    firstProfile?.hasPaid,
    firstProfile?.has_paid,
    profile?.hasPaid,
    profile?.has_paid,
  ];

  for (const c of candidates) {
    const b = coerceHasPaid(c);
    if (b !== undefined) return b;
  }
  return undefined;
}

function pickComplimentaryUntil(raw: Record<string, unknown>): string | null | undefined {
  const v = raw.complimentary_access_until ?? raw.complimentaryAccessUntil;
  if (v === null) return null;
  if (v === undefined) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v) && v > 1e12) return new Date(v).toISOString();
  return undefined;
}

/** Mesma regra que o wag-backend (`profileHasWagooAccess`), recalculada no dashboard. */
function computeWagooHasAccess(hasPaid: boolean | undefined, until: string | null | undefined): boolean {
  if (hasPaid === true) return true;
  if (!until || typeof until !== "string") return false;
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function normalizeUser(raw: unknown): AdminUser | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = asString(r.id);
  if (!id) return null;
  const hasPaid = extractHasPaidFromUserPayload(r);
  const untilPick = pickComplimentaryUntil(r);
  const out: AdminUser = {
    id,
    email: asString(r.email),
    name: asString(r.name),
    role: asString(r.role) ?? "user",
    active: asBool(r.active, true),
    createdAt: asString(r.createdAt) ?? asString(r.created_at),
    lastSignInAt: asString(r.lastSignInAt) ?? asString(r.last_sign_in_at),
  };
  if (hasPaid !== undefined) out.hasPaid = hasPaid;
  if (untilPick !== undefined) out.complimentary_access_until = untilPick;
  if (typeof r.complimentaryViaLink === "boolean") out.complimentaryViaLink = r.complimentaryViaLink;
  if (typeof r.accessOriginSummary === "string") out.accessOriginSummary = r.accessOriginSummary;
  if (typeof r.accessOriginDetail === "string") out.accessOriginDetail = r.accessOriginDetail;
  /** Preferir `hasAccess` calculado no wag-backend (evita divergência por parsing no SSR). */
  if (typeof r.hasAccess === "boolean") {
    out.hasAccess = r.hasAccess;
  } else {
    out.hasAccess = computeWagooHasAccess(out.hasPaid, out.complimentary_access_until);
  }
  return out;
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

/** Evita `WAGOO_API_BASE_URL` já terminar em `/api/admin` e o path repetir o prefixo (404 no catch-all). */
function resolveAdminApiBaseUrl(base: string, source: AdminSource): string {
  let b = base.replace(/\/+$/, "");
  if (source === "wagoo") {
    const lower = b.toLowerCase();
    const suffix = "/api/admin";
    if (lower.endsWith(suffix)) {
      b = b.slice(0, b.length - suffix.length).replace(/\/+$/, "");
    }
  }
  return b;
}

async function callAdminApi(
  source: AdminSource,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const env = getSourceEnv(source);
  const base = env.baseUrl?.trim();
  const key = env.apiKey?.trim();
  if (!base || !key) {
    const hint =
      source === "wagoo"
        ? "Defina WAGOO_API_BASE_URL e WAGOO_METRICS_API_KEY ou ADMIN_API_SECRET (mesmo valor do wag-backend)."
        : "Defina TWO_AVENDAS_API_BASE_URL e TWO_AVENDAS_METRICS_API_KEY.";
    throw new Error(`${source}: credenciais ausentes — ${hint}`);
  }
  const url = new URL(`${resolveAdminApiBaseUrl(base, source)}${path}`);
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
    throw new Error(extractApiErrorMessage(root, source, res.status));
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

export const fetchAdminRoles = createServerFn({ method: "GET" })
  .inputValidator(z.object({ source: sourceSchema }))
  .handler((async (ctx: unknown): Promise<AdminRolesResult> => {
    const { data } = ctx as { data: { source: AdminSource } };
    // Wagoo: console Korven não lista/edita roles; wag-backend não expunha /roles → evita fallback e 404.
    if (data.source === "wagoo") {
      return { items: [], fromFallback: false };
    }
    let fallbackReason = "rota /api/admin/roles indisponível";
    try {
      const raw = await callAdminApi(data.source, "GET", "/api/admin/roles");
      const root = asRecord(raw);
      const dataRoot = asRecord(root?.data);
      const itemsRaw =
        (Array.isArray(dataRoot?.items) && dataRoot?.items) ||
        (Array.isArray(dataRoot?.roles) && dataRoot?.roles) ||
        (Array.isArray(root?.items) && (root?.items as unknown[])) ||
        (Array.isArray(root?.roles) && (root?.roles as unknown[])) ||
        (Array.isArray(root?.data) ? (root?.data as unknown[]) : []);
      const items: AdminRoleOption[] = itemsRaw.reduce<AdminRoleOption[]>((acc, it) => {
        if (typeof it === "string") {
          acc.push({ value: it, label: it });
          return acc;
        }
        const r = asRecord(it);
        if (!r) return acc;
        const value = asString(r.slug) ?? asString(r.value) ?? asString(r.role);
        if (!value) return acc;
        const permsRaw = Array.isArray(r.permissions) ? r.permissions : [];
        const permissions = permsRaw
          .map((p) => (typeof p === "string" ? p : null))
          .filter((p): p is string => !!p);
        acc.push({
          value,
          label: asString(r.label) ?? value,
          description: asString(r.description),
          permissions,
        });
        return acc;
      }, []);
      if (items.length > 0) return { items, fromFallback: false };
      fallbackReason = "resposta de /api/admin/roles sem itens reconhecidos (items/roles)";
    } catch (e) {
      fallbackReason = stringifyCaughtUnknown(e);
    }

    // fallback: infere roles existentes na listagem de usuários
    const usersPage = (await fetchAdminUsers({
      data: { source: data.source, page: 1, limit: 100 },
    })) as AdminUsersPage;
    const unique = [...new Set(usersPage.items.map((u) => u.role).filter(Boolean))];
    return {
      items: unique.map((r) => ({ value: r, label: r })),
      fromFallback: true,
      fallbackReason,
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

/** Wagoo: PATCH `/api/admin/users/:id/has-paid` → atualiza `profiles.has_paid` (Stripe webhook também escreve na coluna). */
export const patchAdminUserHasPaid = createServerFn({ method: "POST" })
  .inputValidator(wagooHasPaidSchema)
  .handler((async (ctx: unknown): Promise<AdminUser | null> => {
    const { data } = ctx as { data: z.infer<typeof wagooHasPaidSchema> };
    const raw = await callAdminApi(
      data.source,
      "PATCH",
      `/api/admin/users/${encodeURIComponent(data.id)}/has-paid`,
      { hasPaid: data.hasPaid, has_paid: data.hasPaid },
    );
    const root = asRecord(raw);
    const payload = asRecord(root?.data);
    return normalizeUser(payload ?? { id: data.id, hasPaid: data.hasPaid });
  }) as any);

const wagooComplimentaryAccessSchema = z.object({
  source: z.literal("wagoo"),
  id: z.string().min(1),
  preset: z.enum(["none", "7", "30", "60", "90", "180", "365"]),
});

/** Wagoo: cortesia administrativa (`complimentary_access_until`); não altera Stripe (`has_paid`). POST evita proxy que bloqueia PATCH. */
export const patchWagooUserComplimentaryAccess = createServerFn({ method: "POST" })
  .inputValidator(wagooComplimentaryAccessSchema)
  .handler((async (ctx: unknown): Promise<AdminUser | null> => {
    const { data } = ctx as { data: z.infer<typeof wagooComplimentaryAccessSchema> };
    const raw = await callAdminApi(
      data.source,
      "POST",
      `/api/admin/users/${encodeURIComponent(data.id)}/complimentary-access`,
      { preset: data.preset },
    );
    const root = asRecord(raw);
    return normalizeUser(root?.data ?? { id: data.id });
  }) as any);

export type WagooPromoLink = {
  id: string;
  code: string;
  label: string | null;
  complimentary_days: number;
  max_redemptions: number | null;
  redemption_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  signup_url?: string;
};

export const fetchWagooPromoLinks = createServerFn({ method: "GET" })
  .inputValidator(z.object({ source: z.literal("wagoo") }))
  .handler((async (ctx: unknown): Promise<WagooPromoLink[]> => {
    const { data } = ctx as { data: { source: "wagoo" } };
    const raw = await callAdminApi(data.source, "GET", "/api/admin/wagoo/promo-links");
    const root = asRecord(raw);
    const payload = asRecord(root?.data) ?? {};
    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    return itemsRaw as WagooPromoLink[];
  }) as any);

const createPromoSchema = z.object({
  source: z.literal("wagoo"),
  label: z.string().max(200).optional(),
  complimentary_days: z.number().int().min(1).max(730).optional(),
  max_redemptions: z.number().int().min(1).optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

export const createWagooPromoLink = createServerFn({ method: "POST" })
  .inputValidator(createPromoSchema)
  .handler((async (ctx: unknown): Promise<WagooPromoLink> => {
    const { data } = ctx as { data: z.infer<typeof createPromoSchema> };
    const body: Record<string, unknown> = {};
    if (data.label != null) body.label = data.label;
    if (data.complimentary_days != null) body.complimentary_days = data.complimentary_days;
    if (data.max_redemptions !== undefined) body.max_redemptions = data.max_redemptions;
    if (data.expires_at !== undefined) body.expires_at = data.expires_at;
    const raw = await callAdminApi(data.source, "POST", "/api/admin/wagoo/promo-links", body);
    const root = asRecord(raw);
    return (root?.data ?? {}) as WagooPromoLink;
  }) as any);

const patchPromoSchema = z.object({
  source: z.literal("wagoo"),
  id: z.string().min(1),
  is_active: z.boolean(),
});

export const patchWagooPromoLinkActive = createServerFn({ method: "POST" })
  .inputValidator(patchPromoSchema)
  .handler((async (ctx: unknown): Promise<WagooPromoLink> => {
    const { data } = ctx as { data: z.infer<typeof patchPromoSchema> };
    const raw = await callAdminApi(
      data.source,
      "PATCH",
      `/api/admin/wagoo/promo-links/${encodeURIComponent(data.id)}`,
      { is_active: data.is_active },
    );
    const root = asRecord(raw);
    return (root?.data ?? {}) as WagooPromoLink;
  }) as any);

const deletePromoSchema = z.object({
  source: z.literal("wagoo"),
  id: z.string().min(1),
});

export const deleteWagooPromoLink = createServerFn({ method: "POST" })
  .inputValidator(deletePromoSchema)
  .handler((async (ctx: unknown): Promise<{ id: string; deleted: boolean }> => {
    const { data } = ctx as { data: z.infer<typeof deletePromoSchema> };
    const raw = await callAdminApi(
      data.source,
      "DELETE",
      `/api/admin/wagoo/promo-links/${encodeURIComponent(data.id)}`,
    );
    const root = asRecord(raw);
    const out = asRecord(root?.data) ?? {};
    return {
      id: asString(out.id) ?? data.id,
      deleted: asBool(out.deleted, true),
    };
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
