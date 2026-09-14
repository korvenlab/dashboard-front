import type {
  AdminRolesResult,
  AdminSource,
  AdminUsersPage,
  WagooPromoLink,
} from "@/lib/admin-api";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

function parseError(json: unknown, fallback: string): string {
  if (
    json &&
    typeof json === "object" &&
    "error" in json &&
    typeof (json as { error: unknown }).error === "string"
  ) {
    return (json as { error: string }).error;
  }
  return fallback;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
  const json = await readJson<T & { error?: string }>(res);
  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) {
    throw new Error(parseError(json, `Falha na API admin (${res.status}).`));
  }
  return json as T;
}

export async function fetchAdminUsersHttp(params: {
  source: AdminSource;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminUsersPage> {
  const q = new URLSearchParams();
  q.set("source", params.source);
  if (params.search?.trim()) q.set("search", params.search.trim());
  q.set("page", String(params.page ?? 1));
  q.set("limit", String(params.limit ?? 20));

  return adminFetch<AdminUsersPage>(
    `/api/dashboard/admin/users?${q.toString()}`,
  );
}

export async function fetchAdminRolesHttp(
  source: AdminSource,
): Promise<AdminRolesResult> {
  return adminFetch<AdminRolesResult>(
    `/api/dashboard/admin/roles?source=${encodeURIComponent(source)}`,
  );
}

export async function fetchWagooPromoLinksHttp(): Promise<WagooPromoLink[]> {
  const json = await adminFetch<{ items: WagooPromoLink[] }>(
    "/api/dashboard/admin/wagoo/promo-links",
  );
  return Array.isArray(json.items) ? json.items : [];
}

export async function createWagooPromoLinkHttp(input: {
  label?: string;
  complimentary_days?: number;
  plan_tier?: "agenda_web" | "basic" | "pro" | "pro_plus";
  max_redemptions?: number | null;
  expires_at?: string | null;
}): Promise<WagooPromoLink> {
  return adminFetch<WagooPromoLink>("/api/dashboard/admin/wagoo/promo-links", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchWagooPromoLinkActiveHttp(input: {
  id: string;
  is_active: boolean;
}): Promise<WagooPromoLink> {
  return adminFetch<WagooPromoLink>(
    `/api/dashboard/admin/wagoo/promo-links/${encodeURIComponent(input.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ is_active: input.is_active }),
    },
  );
}

export async function deleteWagooPromoLinkHttp(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return adminFetch(
    `/api/dashboard/admin/wagoo/promo-links/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
