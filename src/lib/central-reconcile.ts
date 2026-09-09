import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTwoAvendasServerEnv, getWagooServerEnv } from "@/lib/server-env";

export type ReconcileProduct = "wagoo" | "2avendas";

export type ReconcileProductResult = {
  product: ReconcileProduct;
  seen: number;
  upserted: number;
  errors: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveBase(source: ReconcileProduct): {
  baseUrl: string;
  apiKey: string;
} {
  if (source === "wagoo") {
    const env = getWagooServerEnv();
    let base = env.apiBaseUrl?.replace(/\/+$/, "") ?? "";
    // Prefer the metrics/admin key; WAGOO_API_SECRET is the control-plane command key.
    const key =
      env.metricsApiKey?.trim() ||
      (typeof process !== "undefined"
        ? (process.env.WAGOO_API_SECRET || "").trim()
        : "");
    if (base.toLowerCase().endsWith("/api/admin")) {
      base = base.slice(0, -"/api/admin".length).replace(/\/+$/, "");
    }
    if (!base || !key) {
      throw new Error(
        "Wagoo: defina WAGOO_API_BASE_URL e WAGOO_METRICS_API_KEY (ou WAGOO_API_SECRET) na Vercel.",
      );
    }
    return { baseUrl: base, apiKey: key };
  }
  const env = getTwoAvendasServerEnv();
  const base = env.apiBaseUrl?.replace(/\/+$/, "") ?? "";
  const key =
    env.metricsApiKey?.trim() ||
    (typeof process !== "undefined"
      ? (process.env.TWO_AVENDAS_API_SECRET || "").trim()
      : "");
  if (!base || !key) {
    throw new Error(
      "2AVendas: defina TWO_AVENDAS_API_BASE_URL e TWO_AVENDAS_METRICS_API_KEY na Vercel.",
    );
  }
  return { baseUrl: base, apiKey: key };
}

async function fetchSyncPage(
  source: ReconcileProduct,
  page: number,
): Promise<{ items: Record<string, unknown>[]; hasMore: boolean }> {
  const { baseUrl, apiKey } = resolveBase(source);
  const url =
    source === "wagoo"
      ? `${baseUrl}/api/admin/sync/users?page=${page}&per_page=100`
      : `${baseUrl}/api/admin/users/sync?page=${page}&limit=100`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "X-API-Key": apiKey,
      "x-admin-secret": apiKey,
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${source}: resposta não-JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(
      `${source}: sync HTTP ${res.status} em ${baseUrl} · ${text.slice(0, 180)}`,
    );
  }
  const root = asRecord(json) ?? {};
  const payload = asRecord(root.data) ?? root;
  const itemsRaw = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.users)
      ? payload.users
      : Array.isArray(payload.data)
        ? payload.data
        : [];
  const items = itemsRaw.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item),
  );
  const hasMore =
    typeof payload.has_more === "boolean"
      ? payload.has_more
      : payload.next_page != null
        ? true
        : items.length >= 100;
  return { items, hasMore };
}

function normalizeRow(
  source: ReconcileProduct,
  raw: Record<string, unknown>,
): {
  external_user_id: string;
  email: string | null;
  display_name: string | null;
  status: string | null;
  role: string | null;
  plan: string | null;
  organization_id: string | null;
  metadata: Record<string, unknown>;
} | null {
  const external =
    asString(raw.external_user_id) ?? asString(raw.id) ?? asString(raw.user_id);
  if (!external) return null;

  let plan: string | null = null;
  if (typeof raw.plan === "string") plan = raw.plan;
  else if (typeof raw.subscription_tier === "string")
    plan = raw.subscription_tier;
  else if (typeof raw.subscriptionTier === "string")
    plan = raw.subscriptionTier;
  else {
    const planObj = asRecord(raw.plan);
    if (planObj) {
      plan =
        asString(planObj.plan) ??
        asString(planObj.plano) ??
        asString(planObj.status);
    }
  }

  let status: string | null = asString(raw.status);
  if (!status && typeof raw.active === "boolean") {
    status = raw.active ? "active" : "inactive";
  }
  if (!status && raw.deleted_at) status = "deleted";

  return {
    external_user_id: external,
    email: asString(raw.email)?.toLowerCase() ?? null,
    display_name:
      asString(raw.display_name) ??
      asString(raw.name) ??
      asString(raw.store_name),
    status,
    role: asString(raw.role),
    plan,
    organization_id: asString(raw.organization_id),
    metadata: {
      source,
      last_sign_in_at:
        asString(raw.last_sign_in_at) ?? asString(raw.lastSignInAt),
      created_at: asString(raw.created_at) ?? asString(raw.createdAt),
    },
  };
}

async function upsertIdentityRow(
  productId: string,
  row: NonNullable<ReturnType<typeof normalizeRow>>,
) {
  const supabase = getSupabaseServerClient({ admin: true });
  const { data: existingAccount, error: existingError } = await supabase
    .from("user_product_accounts")
    .select("user_id")
    .eq("product_id", productId)
    .eq("external_user_id", row.external_user_id)
    .maybeSingle();
  if (existingError) throw existingError;

  let userId: string | null = existingAccount?.user_id ?? null;
  if (!userId && row.email) {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("email_normalized", row.email)
      .maybeSingle();
    userId = data?.id ?? null;
  }

  if (!userId) {
    const { data, error } = await supabase
      .from("users")
      .insert({
        email: row.email,
        display_name: row.display_name,
        metadata: row.metadata,
      })
      .select("id")
      .single();
    if (error) throw error;
    userId = data.id;
  } else {
    const { error } = await supabase
      .from("users")
      .update({
        ...(row.email ? { email: row.email } : {}),
        ...(row.display_name ? { display_name: row.display_name } : {}),
        metadata: row.metadata,
      })
      .eq("id", userId);
    if (error) throw error;
  }

  const { error: accountError } = await supabase
    .from("user_product_accounts")
    .upsert(
      {
        user_id: userId,
        product_id: productId,
        external_user_id: row.external_user_id,
        organization_id: row.organization_id,
        external_status: row.status,
        external_role: row.role,
        external_plan: row.plan,
        metadata: row.metadata,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "product_id,external_user_id" },
    );
  if (accountError) throw accountError;
}

async function reconcileOne(
  product: ReconcileProduct,
): Promise<ReconcileProductResult> {
  const supabase = getSupabaseServerClient({ admin: true });
  const { data: productRow, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("slug", product)
    .single();
  if (productError || !productRow) {
    throw new Error(`Produto central ${product} não encontrado.`);
  }

  const result: ReconcileProductResult = {
    product,
    seen: 0,
    upserted: 0,
    errors: [],
  };

  for (let page = 1; page <= 100; page++) {
    const { items, hasMore } = await fetchSyncPage(product, page);
    if (!items.length) break;
    for (const raw of items) {
      const row = normalizeRow(product, raw);
      if (!row) continue;
      result.seen++;
      try {
        await upsertIdentityRow(productRow.id, row);
        result.upserted++;
      } catch (cause) {
        result.errors.push(
          `${row.external_user_id}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }
    if (!hasMore) break;
  }

  return result;
}

export async function reconcileCentralProducts(
  products: ReconcileProduct[] = ["wagoo", "2avendas"],
) {
  const results: ReconcileProductResult[] = [];
  for (const product of products) {
    results.push(await reconcileOne(product));
  }
  const { count } = await getSupabaseServerClient({ admin: true })
    .from("dashboard_unified_users")
    .select("id", { count: "exact", head: true });
  return {
    ok: true as const,
    results,
    unifiedUsers: count ?? 0,
  };
}
