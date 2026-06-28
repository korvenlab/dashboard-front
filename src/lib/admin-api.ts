import { protectedServerFn } from "@/lib/protected-server-fn";
import { z } from "zod";
import { getTwoAvendasServerEnv, getTwoAvendasBillingAdminSecret, getWagooServerEnv } from "@/lib/server-env";

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
  /** Wagoo: basic | pro | pro_plus */
  subscriptionTier?: "basic" | "pro" | "pro_plus" | null;
  subscription_tier?: "basic" | "pro" | "pro_plus" | null;
  /** Wagoo: add-on Plano Multi-Barbeiro (`profiles.multi_barber_plan`). */
  multiBarberPlan?: boolean;
  multi_barber_plan?: boolean;
  /** Wagoo: profissionais em `barbeiros`. */
  barbeirosCount?: number;
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

const wagooMultiBarberPlanSchema = z.object({
  source: z.literal("wagoo"),
  id: z.string().min(1),
  multiBarberPlan: z.boolean(),
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
function coerceMultiBarberPlan(v: unknown): boolean | undefined {
  return coerceHasPaid(v);
}

function extractMultiBarberPlanFromUserPayload(raw: Record<string, unknown>): boolean | undefined {
  const profile = asRecord(raw.profile);
  const profilesArr = Array.isArray(raw.profiles) ? raw.profiles : null;
  const firstProfile = profilesArr?.length ? asRecord(profilesArr[0]) : undefined;
  const candidates = [
    raw.multiBarberPlan,
    raw.multi_barber_plan,
    firstProfile?.multiBarberPlan,
    firstProfile?.multi_barber_plan,
    profile?.multiBarberPlan,
    profile?.multi_barber_plan,
  ];
  for (const c of candidates) {
    const b = coerceMultiBarberPlan(c);
    if (b !== undefined) return b;
  }
  return undefined;
}

function extractBarbeirosCount(raw: Record<string, unknown>): number | undefined {
  const candidates = [
    raw.barbeirosCount,
    raw.barbeiros_count,
    asRecord(raw.profile)?.barbeirosCount,
    asRecord(raw.profile)?.barbeiros_count,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c >= 0) return c;
  }
  return undefined;
}

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
  const profile = asRecord(raw.profile);
  const profilesArr = Array.isArray(raw.profiles) ? raw.profiles : null;
  const firstProfile = profilesArr?.length ? asRecord(profilesArr[0]) : undefined;
  const v =
    raw.complimentary_access_until ??
    raw.complimentaryAccessUntil ??
    firstProfile?.complimentary_access_until ??
    firstProfile?.complimentaryAccessUntil ??
    profile?.complimentary_access_until ??
    profile?.complimentaryAccessUntil;
  if (v === null) return null;
  if (v === undefined) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const ms = epochNumberToMillis(v);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  }
  return undefined;
}

/** Igual ao wag-backend `profileAccess.epochNumberToMillis` (segundos vs ms). */
function epochNumberToMillis(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return NaN;
  if (n < 10_000_000_000) return Math.round(n * 1000);
  return Math.round(n);
}

/** Espelha `complimentaryUntilToMillis` do wag-backend (`profileAccess.ts`). */
function complimentaryUntilToMillis(until: unknown): number | null {
  if (until === null || until === undefined) return null;
  if (typeof until === "string") {
    const s = until.trim();
    if (!s) return null;
    const fromIso = new Date(s).getTime();
    if (Number.isFinite(fromIso)) return fromIso;
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) {
      const ms = epochNumberToMillis(n);
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  }
  if (typeof until === "number" && Number.isFinite(until) && until > 0) {
    const ms = epochNumberToMillis(until);
    return Number.isFinite(ms) ? ms : null;
  }
  if (until instanceof Date) {
    const t = until.getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Mesma regra que o wag-backend (`profileHasWagooAccess`), recalculada no dashboard. */
function computeWagooHasAccess(hasPaid: boolean | undefined, until: unknown): boolean {
  if (hasPaid === true) return true;
  const ms = complimentaryUntilToMillis(until);
  return ms != null && ms > Date.now();
}

/**
 * Cortesia ainda válida (mesma lógica que `profileAccess.ts` no wag-backend).
 * Exportado para a UI do admin usar exactamente o mesmo critério que `hasAccess`.
 */
export function wagooComplimentaryIsActive(until: unknown): boolean {
  const ms = complimentaryUntilToMillis(until);
  return ms != null && ms > Date.now();
}

/** Tempo restante até `complimentary_access_until` (rótulo curto). */
export function wagooFormatComplimentaryRemaining(until: unknown): string {
  if (!wagooComplimentaryIsActive(until)) return "—";
  const ms = complimentaryUntilToMillis(until);
  if (ms == null) return "—";
  const left = ms - Date.now();
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((left % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}min`;
  return `${Math.max(0, m)} min`;
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
  const tierRaw = r.subscriptionTier ?? r.subscription_tier;
  if (tierRaw === "basic" || tierRaw === "pro" || tierRaw === "pro_plus") {
    out.subscriptionTier = tierRaw;
    out.subscription_tier = tierRaw;
  } else if (tierRaw === null) {
    out.subscriptionTier = null;
    out.subscription_tier = null;
  }
  const multiBarberPlan = extractMultiBarberPlanFromUserPayload(r);
  if (multiBarberPlan !== undefined) {
    out.multiBarberPlan = multiBarberPlan;
    out.multi_barber_plan = multiBarberPlan;
  }
  const barbeirosCount = extractBarbeirosCount(r);
  if (barbeirosCount !== undefined) out.barbeirosCount = barbeirosCount;
  /**
   * Nunca confiar só em `hasAccess` da API: proxies/serialização podem desalinhar.
   * Recalcular sempre a partir de `has_paid` + `complimentary_access_until` (igual ao app).
   */
  out.hasAccess = computeWagooHasAccess(out.hasPaid, untilPick);
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
        ? "Defina WAGOO_API_BASE_URL e WAGOO_METRICS_API_KEY (ou METRICS_API_KEY / ADMIN_API_SECRET) no Vercel."
        : "Defina DASHBOARD_BACKEND_BASE_URL e DASHBOARD_BACKEND_API_KEY (ou TWO_AVENDAS_* / METRICS_API_KEY) no Vercel.";
    throw new Error(`${source}: credenciais ausentes — ${hint}`);
  }
  const url = new URL(`${resolveAdminApiBaseUrl(base, source)}${path}`);
  /** Evita resposta GET em cache (lista admin desactualizada após alterações). */
  if (method === "GET") {
    url.searchParams.set("_ts", String(Date.now()));
  }
  const res = await fetch(url.toString(), {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(method === "GET" ? { "Cache-Control": "no-store", Pragma: "no-cache" } : {}),
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

function extractAdminUsersItems(raw: unknown): unknown[] {
  const root = asRecord(raw);
  if (!root) return [];
  const data = asRecord(root.data);
  const candidates = [
    data?.items,
    data?.users,
    root.items,
    root.users,
    Array.isArray(root.data) ? root.data : null,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

export async function listAdminUsers(input: z.infer<typeof listSchema>): Promise<AdminUsersPage> {
  const q = new URLSearchParams();
  if (input.search?.trim()) q.set("search", input.search.trim());
  q.set("page", String(input.page));
  q.set("limit", String(input.limit));
  const raw = await callAdminApi(input.source, "GET", `/api/admin/users?${q.toString()}`);
  const itemsRaw = extractAdminUsersItems(raw);
  const root = asRecord(raw);
  const payload = asRecord(root?.data) ?? root ?? {};
  const items = itemsRaw.map(normalizeUser).filter((x): x is AdminUser => !!x);
  return {
    items,
    page: asNumber(payload.page, input.page),
    limit: asNumber(payload.limit, input.limit),
    total: asNumber(payload.total, items.length),
  };
}

export const fetchAdminUsers = protectedServerFn("GET")
  .inputValidator(listSchema)
  .handler((async (ctx: unknown): Promise<AdminUsersPage> => {
    const { data } = ctx as { data: z.infer<typeof listSchema> };
    return listAdminUsers(data);
  }) as any);

export async function listAdminRoles(source: AdminSource): Promise<AdminRolesResult> {
  if (source === "wagoo") {
    return { items: [], fromFallback: false };
  }
  let fallbackReason = "rota /api/admin/roles indisponível";
  try {
    const raw = await callAdminApi(source, "GET", "/api/admin/roles");
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

  const usersPage = await listAdminUsers({ source, page: 1, limit: 100 });
  const unique = [...new Set(usersPage.items.map((u) => u.role).filter(Boolean))];
  return {
    items: unique.map((r) => ({ value: r, label: r })),
    fromFallback: true,
    fallbackReason,
  };
}

export const fetchAdminRoles = protectedServerFn("GET")
  .inputValidator(z.object({ source: sourceSchema }))
  .handler((async (ctx: unknown): Promise<AdminRolesResult> => {
    const { data } = ctx as { data: { source: AdminSource } };
    return listAdminRoles(data.source);
  }) as any);

export const fetchAdminUser = protectedServerFn("GET")
  .inputValidator(byIdSchema)
  .handler((async (ctx: unknown): Promise<AdminUser | null> => {
    const { data } = ctx as { data: z.infer<typeof byIdSchema> };
    const raw = await callAdminApi(data.source, "GET", `/api/admin/users/${encodeURIComponent(data.id)}`);
    const root = asRecord(raw);
    return normalizeUser(root?.data ?? null);
  }) as any);

export const fetchAdminUserAssets = protectedServerFn("GET")
  .inputValidator(byIdSchema)
  .handler((async (ctx: unknown): Promise<AdminUserAsset[]> => {
    const { data } = ctx as { data: z.infer<typeof byIdSchema> };
    const raw = await callAdminApi(data.source, "GET", `/api/admin/users/${encodeURIComponent(data.id)}/assets`);
    const root = asRecord(raw);
    const payload = asRecord(root?.data) ?? {};
    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    return itemsRaw.map(normalizeAsset).filter((x): x is AdminUserAsset => !!x);
  }) as any);

export const patchAdminUserRole = protectedServerFn("POST")
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

export const patchAdminUserStatus = protectedServerFn("POST")
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
export const patchAdminUserHasPaid = protectedServerFn("POST")
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
export const patchWagooUserComplimentaryAccess = protectedServerFn("POST")
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

const wagooSubscriptionTierSchema = z.object({
  source: z.literal("wagoo"),
  id: z.string().min(1),
  subscriptionTier: z.enum(["basic", "pro", "pro_plus"]).nullable(),
});

/** Wagoo: define plano (basic | pro | pro_plus) ou revoga com null. */
export const patchWagooUserSubscriptionTier = protectedServerFn("POST")
  .inputValidator(wagooSubscriptionTierSchema)
  .handler((async (ctx: unknown): Promise<AdminUser | null> => {
    const { data } = ctx as { data: z.infer<typeof wagooSubscriptionTierSchema> };
    const raw = await callAdminApi(
      data.source,
      "POST",
      `/api/admin/users/${encodeURIComponent(data.id)}/subscription-tier`,
      { subscriptionTier: data.subscriptionTier },
    );
    const root = asRecord(raw);
    return normalizeUser(root?.data ?? { id: data.id, subscriptionTier: data.subscriptionTier });
  }) as any);

/** Wagoo: activa ou revoga Plano Multi-Barbeiro (`multi_barber_plan`). */
export const patchWagooUserMultiBarberPlan = protectedServerFn("POST")
  .inputValidator(wagooMultiBarberPlanSchema)
  .handler((async (ctx: unknown): Promise<AdminUser | null> => {
    const { data } = ctx as { data: z.infer<typeof wagooMultiBarberPlanSchema> };
    const raw = await callAdminApi(
      data.source,
      "POST",
      `/api/admin/users/${encodeURIComponent(data.id)}/multi-barber-plan`,
      { multiBarberPlan: data.multiBarberPlan },
    );
    const root = asRecord(raw);
    return normalizeUser(root?.data ?? { id: data.id, multiBarberPlan: data.multiBarberPlan });
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

export const fetchWagooPromoLinks = protectedServerFn("GET")
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

export const createWagooPromoLink = protectedServerFn("POST")
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

export const patchWagooPromoLinkActive = protectedServerFn("POST")
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

export const deleteWagooPromoLink = protectedServerFn("POST")
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

export const deleteAdminUser = protectedServerFn("POST")
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

const mint2AvendasUnlockSchema = z.object({
  organizationId: z.string().uuid(),
  ttlSeconds: z.number().int().min(120).max(2592000).optional(),
});

/** Chama 2A-back `POST /api/billing/organization-access-link` (fluxo tipo link Wagoo / liberação sem Stripe). */
export const mintTwoAvendasOrgAccessLink = protectedServerFn("POST")
  .inputValidator(mint2AvendasUnlockSchema)
  .handler(
    (async (
      ctx: unknown,
    ): Promise<{ unlock_url: string; expires_at: string | null; organization_id: string }> => {
      const { data } = ctx as { data: z.infer<typeof mint2AvendasUnlockSchema> };
      const env = getTwoAvendasServerEnv();
      const base = env.apiBaseUrl?.trim();
      const billingSecret =
        getTwoAvendasBillingAdminSecret()?.trim() || env.metricsApiKey?.trim();
      if (!base || !billingSecret) {
        throw new Error("2avendas: TWO_AVENDAS_API_BASE_URL e segredo de billing (TWO_AVENDAS_BILLING_ADMIN_SECRET ou métricas) são obrigatórios");
      }
      const url = `${base.replace(/\/+$/, "")}/api/billing/organization-access-link`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Billing-Admin-Secret": billingSecret,
        },
        body: JSON.stringify({
          organization_id: data.organizationId,
          ...(data.ttlSeconds != null ? { ttl_seconds: data.ttlSeconds } : {}),
        }),
      });
      const text = await res.text();
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("application/json")) {
        throw new Error(`2avendas: resposta não-JSON (${res.status})`);
      }
      const json = text ? (JSON.parse(text) as unknown) : {};
      const root = asRecord(json);
      if (!res.ok || root?.ok === false) {
        throw new Error(extractApiErrorMessage(root, "2avendas", res.status));
      }
      const payload = asRecord(root?.data) ?? {};
      const unlock_url = asString(payload.unlock_url);
      if (!unlock_url?.trim()) {
        throw new Error("2avendas: resposta sem unlock_url");
      }
      return {
        unlock_url: unlock_url.trim(),
        expires_at: asString(payload.expires_at),
        organization_id: asString(payload.organization_id) ?? data.organizationId,
      };
    }) as any,
  );

export type TwoAvendasPromoLink = WagooPromoLink;

function twoAvendasBillingEnv(): { base: string; secret: string } {
  const env = getTwoAvendasServerEnv();
  const base = env.apiBaseUrl?.trim();
  const secret = getTwoAvendasBillingAdminSecret()?.trim() || env.metricsApiKey?.trim();
  if (!base || !secret) {
    throw new Error(
      "2avendas: TWO_AVENDAS_API_BASE_URL e segredo de billing (TWO_AVENDAS_BILLING_ADMIN_SECRET ou métricas) são obrigatórios",
    );
  }
  return { base: base.replace(/\/+$/, ""), secret };
}

async function twoAvendasBillingRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const { base, secret } = twoAvendasBillingEnv();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Billing-Admin-Secret": secret,
    },
    ...(body !== undefined && method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new Error(`2avendas: resposta não-JSON (${res.status})`);
  }
  const json = text ? (JSON.parse(text) as unknown) : {};
  const root = asRecord(json);
  if (!res.ok || root?.ok === false) {
    throw new Error(extractApiErrorMessage(root, "2avendas", res.status));
  }
  return root ?? {};
}

export const fetchTwoAvendasPromoLinks = protectedServerFn("GET")
  .inputValidator(z.object({}))
  .handler((async (): Promise<TwoAvendasPromoLink[]> => {
    const root = await twoAvendasBillingRequest("GET", "/api/billing/promo-links");
    const payload = asRecord(root?.data) ?? {};
    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    return itemsRaw as TwoAvendasPromoLink[];
  }) as any);

const createTwoAvendasPromoSchema = z.object({
  label: z.string().max(200).optional(),
  complimentary_days: z.number().int().min(1).max(730).optional(),
  max_redemptions: z.number().int().min(1).optional().nullable(),
});

export const createTwoAvendasPromoLink = protectedServerFn("POST")
  .inputValidator(createTwoAvendasPromoSchema)
  .handler((async (ctx: unknown): Promise<TwoAvendasPromoLink> => {
    const { data } = ctx as { data: z.infer<typeof createTwoAvendasPromoSchema> };
    const body: Record<string, unknown> = {};
    if (data.label != null) body.label = data.label;
    if (data.complimentary_days != null) body.complimentary_days = data.complimentary_days;
    if (data.max_redemptions !== undefined) body.max_redemptions = data.max_redemptions;
    const root = await twoAvendasBillingRequest("POST", "/api/billing/promo-links", body);
    return (asRecord(root?.data) ?? {}) as TwoAvendasPromoLink;
  }) as any);

const patchTwoAvendasPromoSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
});

export const patchTwoAvendasPromoLinkActive = protectedServerFn("POST")
  .inputValidator(patchTwoAvendasPromoSchema)
  .handler((async (ctx: unknown): Promise<TwoAvendasPromoLink> => {
    const { data } = ctx as { data: z.infer<typeof patchTwoAvendasPromoSchema> };
    const root = await twoAvendasBillingRequest(
      "PATCH",
      `/api/billing/promo-links/${encodeURIComponent(data.id)}`,
      { is_active: data.is_active },
    );
    return (asRecord(root?.data) ?? {}) as TwoAvendasPromoLink;
  }) as any);

const deleteTwoAvendasPromoSchema = z.object({
  id: z.string().uuid(),
});

export const deleteTwoAvendasPromoLink = protectedServerFn("POST")
  .inputValidator(deleteTwoAvendasPromoSchema)
  .handler((async (ctx: unknown): Promise<{ id: string; deleted: boolean }> => {
    const { data } = ctx as { data: z.infer<typeof deleteTwoAvendasPromoSchema> };
    const root = await twoAvendasBillingRequest(
      "DELETE",
      `/api/billing/promo-links/${encodeURIComponent(data.id)}`,
    );
    const out = asRecord(root?.data) ?? {};
    return {
      id: asString(out.id) ?? data.id,
      deleted: asBool(out.deleted, true),
    };
  }) as any);
