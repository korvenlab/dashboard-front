import { getSupabaseServerClient } from "@/lib/supabase/server";
import { describeSupabaseEnv, getSupabaseServerEnv } from "@/lib/server-env";
import type {
  AuditLog,
  Notification,
  PaymentEvent,
  ProductAccount,
  UnifiedUser,
  UnifiedUserDetails,
  UnifiedUsersPage,
  UserActivityEvent,
} from "@/lib/supabase/types";

type Row = Record<string, unknown>;

export type CentralListQuery = {
  search?: string;
  product?: string;
  status?: string;
  page?: number;
  limit?: number;
};

export type CentralCommandInput = {
  userId: string;
  productSlug: "wagoo" | "2avendas";
  action:
    "role.set" | "status.set" | "plan.set" | "access.grant" | "user.delete";
  params?: Record<string, unknown>;
  reason?: string;
};

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function rows(v: unknown): Row[] {
  return Array.isArray(v)
    ? v.filter((item): item is Row => !!item && typeof item === "object")
    : [];
}

function normalizeAccounts(row: Row): ProductAccount[] {
  const source =
    row.product_accounts ?? row.accounts ?? row.user_product_accounts;
  return rows(source).map((account) => ({
    id:
      str(account.id) ??
      `${str(account.product_slug) ?? "product"}-${str(account.external_user_id) ?? "account"}`,
    user_id: str(account.user_id) ?? str(row.id) ?? "",
    product_id: str(account.product_id),
    product_slug: str(account.product_slug) ?? str(account.slug),
    external_user_id: str(account.external_user_id),
    status: str(account.status),
    plan: str(account.plan) ?? str(account.plan_name),
    last_login_at: str(account.last_login_at),
    last_synced_at: str(account.last_synced_at) ?? str(account.synced_at),
    metadata: (account.metadata ?? null) as ProductAccount["metadata"],
  }));
}

function normalizeUser(value: unknown): UnifiedUser | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Row;
  const id = str(row.id) ?? str(row.user_id);
  if (!id) return null;
  const accounts = normalizeAccounts(row);
  const productsRaw = Array.isArray(row.products)
    ? row.products.filter((item): item is string => typeof item === "string")
    : [];
  const products = productsRaw.length
    ? productsRaw
    : accounts.flatMap((account) =>
        account.product_slug ? [account.product_slug] : [],
      );
  return {
    id,
    email: str(row.email),
    name: str(row.name) ?? str(row.full_name),
    status: str(row.status) ?? str(row.user_status),
    created_at: str(row.created_at),
    last_login_at: str(row.last_login_at) ?? str(row.last_sign_in_at),
    product_accounts: accounts,
    products: [...new Set(products)],
    plan:
      str(row.plan) ??
      str(row.plan_name) ??
      accounts.find((account) => account.plan)?.plan ??
      null,
    payment_status: str(row.payment_status) ?? str(row.subscription_status),
    last_synced_at:
      str(row.last_synced_at) ??
      accounts.find((account) => account.last_synced_at)?.last_synced_at ??
      null,
  };
}

function throwSupabase(
  error: { message: string; details?: string | null } | null,
  context: string,
) {
  if (error)
    throw new Error(
      `${context}: ${error.message}${error.details ? ` (${error.details})` : ""}`,
    );
}

export function getCentralHealth() {
  const diag = describeSupabaseEnv();
  return {
    ok: Boolean(
      diag.urlPresent &&
      diag.serviceRolePresent &&
      diag.urlMatchesKey !== false,
    ),
    source: "supabase-central",
    routes: {
      health: "GET /api/dashboard/central/health",
      users: "GET /api/dashboard/central/users",
      user: "GET /api/dashboard/central/users/:id",
      command: "POST /api/dashboard/central/command",
      accessLink: "POST /api/dashboard/central/access-link",
      notifications: "GET /api/dashboard/central/notifications",
      notificationMutate: "POST /api/dashboard/central/notifications",
      payments: "GET /api/dashboard/central/payments",
      publicConfig: "GET /api/dashboard/central/public-config",
      metrics: "GET /api/dashboard/metrics",
    },
    env: diag,
  };
}

export type CentralPaymentRow = {
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

function resolvePaymentProvider(payload: unknown): CentralPaymentRow["provider"] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "unknown";
  }
  const root = payload as Record<string, unknown>;
  const nested =
    root.payload && typeof root.payload === "object" && !Array.isArray(root.payload)
      ? (root.payload as Record<string, unknown>)
      : root;
  if (nested.provider === "mercadopago" || nested.provider === "stripe") {
    return nested.provider;
  }
  if (typeof nested.mercadopago_payment_id === "string") return "mercadopago";
  if (typeof nested.stripe_event_id === "string") return "stripe";
  if (
    typeof root.stripe_event_id === "string" &&
    root.stripe_event_id.startsWith("mp:")
  ) {
    return "mercadopago";
  }
  if (typeof root.stripe_event_id === "string") return "stripe";
  return "unknown";
}

export async function listRecentPayments(input?: {
  product?: "wagoo" | "2avendas";
  limit?: number;
}): Promise<CentralPaymentRow[]> {
  const limit = Math.min(100, Math.max(1, input?.limit ?? 40));
  const supabase = getSupabaseServerClient({ admin: true });
  let productId: string | null = null;
  if (input?.product) {
    const { data: product, error } = await supabase
      .from("products")
      .select("id")
      .eq("slug", input.product)
      .maybeSingle();
    throwSupabase(error, "Falha ao resolver produto");
    productId = product?.id ? String(product.id) : null;
  }
  let query = supabase
    .from("payment_events")
    .select(
      "id,event_type,status,amount,currency,plan,stripe_event_id,stripe_object_id,payload,created_at,product_id",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (productId) query = query.eq("product_id", productId);
  const { data, error } = await query;
  throwSupabase(error, "Falha ao consultar pagamentos recentes");
  return rows(data).map((row) => {
    const payload = row.payload;
    const nested =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? ((payload as Row).payload &&
          typeof (payload as Row).payload === "object" &&
          !Array.isArray((payload as Row).payload)
            ? ((payload as Row).payload as Row)
            : (payload as Row))
        : {};
    const meta =
      nested.metadata &&
      typeof nested.metadata === "object" &&
      !Array.isArray(nested.metadata)
        ? (nested.metadata as Row)
        : {};
    return {
      id: str(row.id) ?? "",
      provider: resolvePaymentProvider(payload),
      event_type: str(row.event_type),
      status: str(row.status),
      amount_cents:
        typeof row.amount === "number" && Number.isFinite(row.amount)
          ? row.amount
          : null,
      currency: str(row.currency),
      plan: str(row.plan) ?? str(nested.plan) ?? str(meta.plan),
      kind: str(nested.kind) ?? str(meta.kind),
      object_id: str(row.stripe_object_id) ?? str(row.stripe_event_id),
      created_at: str(row.created_at) ?? new Date().toISOString(),
    } satisfies CentralPaymentRow;
  });
}

export async function listUnifiedUsers(
  data: CentralListQuery,
): Promise<UnifiedUsersPage> {
  const page = data.page ?? 1;
  const limit = data.limit ?? 25;
  const supabase = getSupabaseServerClient({ admin: true });
  const from = (page - 1) * limit;
  let query = supabase
    .from("dashboard_unified_users")
    .select("*", { count: "exact" })
    .range(from, from + limit - 1)
    .order("created_at", { ascending: false });
  if (data.search?.trim()) {
    const safe = data.search.trim().replace(/[,%()]/g, " ");
    query = query.or(`email.ilike.%${safe}%,name.ilike.%${safe}%`);
  }
  if (data.product?.trim())
    query = query.contains("products", [data.product.trim()]);
  if (data.status?.trim()) query = query.eq("status", data.status.trim());
  const { data: result, error, count } = await query;
  throwSupabase(error, "Falha ao consultar usuários centrais");
  return {
    items: (result ?? [])
      .map(normalizeUser)
      .filter((item): item is UnifiedUser => !!item),
    page,
    limit,
    total: count ?? 0,
  };
}

async function listByUser(table: string, userId: string, limit: number) {
  const { data, error } = await getSupabaseServerClient({ admin: true })
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwSupabase(error, `Falha ao consultar ${table}`);
  return rows(data);
}

async function resolveProductAccount(userId: string, productSlug: string) {
  const supabase = getSupabaseServerClient({ admin: true });
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id,slug")
    .eq("slug", productSlug)
    .single();
  throwSupabase(productError, "Produto central não encontrado");
  if (!product) throw new Error("Produto central não encontrado.");
  const { data: account, error: accountError } = await supabase
    .from("user_product_accounts")
    .select("id,external_user_id,organization_id")
    .eq("user_id", userId)
    .eq("product_id", product.id)
    .maybeSingle();
  throwSupabase(accountError, "Falha ao localizar conta do produto");
  if (!account?.external_user_id)
    throw new Error(`Usuário sem conta vinculada ao produto ${productSlug}.`);
  return account as {
    id: string;
    external_user_id: string;
    organization_id: string | null;
  };
}

export async function getUnifiedUserDetails(
  userId: string,
): Promise<UnifiedUserDetails> {
  const supabase = getSupabaseServerClient({ admin: true });
  const userResult = await supabase
    .from("dashboard_unified_users")
    .select("*")
    .eq("id", userId)
    .single();
  throwSupabase(userResult.error, "Falha ao consultar usuário central");
  const user = normalizeUser(userResult.data);
  if (!user) throw new Error("Usuário central não encontrado.");
  const accountIds = user.product_accounts.map((account) => account.id);
  const activityPromise = listByUser("user_activity_events", userId, 50);
  const paymentsPromise = accountIds.length
    ? supabase
        .from("payment_events")
        .select("*")
        .in("account_id", accountIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : Promise.resolve({ data: [], error: null });
  const auditTargets = [userId, ...accountIds];
  const auditPromise = supabase
    .from("audit_logs")
    .select("*")
    .in("target_id", auditTargets)
    .order("created_at", { ascending: false })
    .limit(50);
  const [activity, paymentsResult, auditResult] = await Promise.all([
    activityPromise,
    paymentsPromise,
    auditPromise,
  ]);
  throwSupabase(paymentsResult.error, "Falha ao consultar pagamentos");
  throwSupabase(auditResult.error, "Falha ao consultar auditoria");
  return {
    user,
    activity: activity as UserActivityEvent[],
    payments: rows(paymentsResult.data) as PaymentEvent[],
    audit: rows(auditResult.data) as AuditLog[],
  };
}

export async function runCentralAdminCommand(data: CentralCommandInput) {
  const account = await resolveProductAccount(data.userId, data.productSlug);
  const idempotencyKey = crypto.randomUUID();
  const { data: result, error } = await getSupabaseServerClient({
    admin: true,
  }).functions.invoke("admin-command", {
    body: {
      product: data.productSlug,
      action: data.action,
      external_user_id: account.external_user_id,
      organization_id: account.organization_id,
      idempotency_key: idempotencyKey,
      params: data.params ?? {},
      reason: data.reason ?? null,
    },
  });
  throwSupabase(error, "Falha ao executar comando administrativo");
  const response = (result && typeof result === "object" ? result : {}) as Row;
  return {
    ok: response.ok !== false,
    commandId:
      str(response.command_id) ??
      str(response.id) ??
      (response.command && typeof response.command === "object"
        ? (str((response.command as Row).id) ?? undefined)
        : undefined),
    message: str(response.message) ?? undefined,
  };
}

export async function createCentralAccessLinkService(input: {
  userId: string;
  productSlug: string;
}) {
  const account = await resolveProductAccount(input.userId, input.productSlug);
  const { data: result, error } = await getSupabaseServerClient({
    admin: true,
  }).functions.invoke("access-link", {
    body: {
      product: input.productSlug,
      kind: input.productSlug === "wagoo" ? "promo" : "complimentary",
      external_user_id: account.external_user_id,
      organization_id: account.organization_id,
      idempotency_key: crypto.randomUUID(),
    },
  });
  throwSupabase(error, "Falha ao gerar link de acesso");
  const response = (result && typeof result === "object" ? result : {}) as Row;
  const accessLink =
    response.access_link &&
    typeof response.access_link === "object" &&
    !Array.isArray(response.access_link)
      ? (response.access_link as Row)
      : response;
  const url =
    str(accessLink.url) ??
    str(response.url) ??
    str(response.access_url) ??
    str(response.access_link);
  if (!url)
    throw new Error("A Edge Function access-link não retornou uma URL.");
  return {
    url,
    expiresAt: str(accessLink.expires_at) ?? str(response.expires_at),
  };
}

export async function listNotifications(includeArchived = false) {
  let query = getSupabaseServerClient({ admin: true })
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data: result, error } = await query;
  throwSupabase(error, "Falha ao consultar notificações");
  return rows(result).map((item) => ({
    id: str(item.id) ?? "",
    title: str(item.title) ?? "Notificação",
    message: str(item.body),
    level: str(item.severity),
    href:
      item.user_id && typeof item.user_id === "string"
        ? `/admin?user=${encodeURIComponent(item.user_id)}`
        : "/wagoo",
    context: (item.data ?? null) as Notification["context"],
    read_at: str(item.read_at),
    archived_at: str(item.archived_at),
    created_at: str(item.created_at) ?? new Date().toISOString(),
  })) satisfies Notification[];
}

/** Monitoramento MP via control plane (ingest) — sem depender de WAGOO_API_BASE_URL. */
export type MpCentralMonitorEvent = {
  id: string;
  source: "ingest" | "notification";
  topic: string;
  data_id: string;
  action: string | null;
  live_mode: boolean | null;
  processed_at: string;
  status: string | null;
  kind: string | null;
};

export async function listMpCentralMonitoring(limit = 40): Promise<{
  events: MpCentralMonitorEvent[];
  summary: {
    last_24h_total: number;
    by_topic_24h: Record<string, number>;
    last_received_at: string | null;
    last_received_age_sec: number | null;
    healthy: boolean | null;
  };
  runtime_signals: {
    id: string;
    status: string;
    message: string;
    timestamp: string;
  }[];
}> {
  const [payments, notifications] = await Promise.all([
    listRecentPayments({ product: "wagoo", limit: Math.min(100, limit * 2) }),
    listNotifications(true),
  ]);

  const mpPayments = payments.filter((p) => p.provider === "mercadopago");
  const events: MpCentralMonitorEvent[] = mpPayments.slice(0, limit).map((p) => ({
    id: p.id,
    source: "ingest" as const,
    topic: p.event_type || "payment",
    data_id: p.object_id || p.id,
    action: p.status,
    live_mode: null,
    processed_at: p.created_at,
    status: p.status,
    kind: p.kind,
  }));

  const mpNotifs = notifications.filter((n) =>
    /mercado\s*pago|mercadopago|\bmp\b.*webhook|webhook.*\bmp\b/i.test(
      `${n.title} ${n.message ?? ""}`,
    ),
  );

  const runtime_signals = mpNotifs.slice(0, 30).map((n) => ({
    id: n.id,
    status:
      n.level === "error" || n.level === "critical"
        ? "offline"
        : n.level === "warning"
          ? "degraded"
          : "online",
    message: [n.title, n.message].filter(Boolean).join(" · "),
    timestamp: n.created_at,
  }));

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const last24 = events.filter(
    (e) => new Date(e.processed_at).getTime() >= since,
  );
  const byTopic: Record<string, number> = {};
  for (const e of last24) {
    byTopic[e.topic] = (byTopic[e.topic] || 0) + 1;
  }
  const lastAt = events[0]?.processed_at ?? null;
  const ageSec = lastAt
    ? Math.max(0, Math.round((Date.now() - new Date(lastAt).getTime()) / 1000))
    : null;

  return {
    events,
    summary: {
      last_24h_total: last24.length,
      by_topic_24h: byTopic,
      last_received_at: lastAt,
      last_received_age_sec: ageSec,
      healthy:
        ageSec == null
          ? null
          : ageSec < 6 * 60 * 60
            ? true
            : ageSec < 48 * 60 * 60
              ? null
              : false,
    },
    runtime_signals,
  };
}

export async function mutateNotificationService(input: {
  id: string;
  action: "read" | "archive";
}) {
  const patch =
    input.action === "read"
      ? { read_at: new Date().toISOString() }
      : { archived_at: new Date().toISOString() };
  const { error } = await getSupabaseServerClient({ admin: true })
    .from("notifications")
    .update(patch)
    .eq("id", input.id);
  throwSupabase(error, "Falha ao atualizar notificação");
  return { ok: true as const };
}

export function getPublicSupabaseConfig() {
  const env = getSupabaseServerEnv();
  if (!env.url || !env.anonKey) {
    throw new Error(
      "Realtime indisponível: SUPABASE_URL/SUPABASE_ANON_KEY ausentes.",
    );
  }
  return { url: env.url, anonKey: env.anonKey };
}
