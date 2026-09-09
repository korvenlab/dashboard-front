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
      publicConfig: "GET /api/dashboard/central/public-config",
      metrics: "GET /api/dashboard/metrics",
    },
    env: diag,
  };
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
        : null,
    context: (item.data ?? null) as Notification["context"],
    read_at: str(item.read_at),
    archived_at: str(item.archived_at),
    created_at: str(item.created_at) ?? new Date().toISOString(),
  })) satisfies Notification[];
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
