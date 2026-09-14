import type {
  AdminRolesResult,
  AdminSource,
  AdminUsersPage,
  TwoAvendasPromoLink,
  WagooPromoLink,
} from "@/lib/admin-api";

export type { WagooPromoLink, TwoAvendasPromoLink };

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

export async function deleteWagooPromoLinkHttp(input: {
  id: string;
}): Promise<{ id: string; deleted: boolean }> {
  return adminFetch(
    `/api/dashboard/admin/wagoo/promo-links/${encodeURIComponent(input.id)}`,
    { method: "DELETE" },
  );
}

export async function fetchTwoAvendasPromoLinksHttp(): Promise<
  TwoAvendasPromoLink[]
> {
  return adminFetch("/api/dashboard/admin/2avendas/promo-links");
}

export async function createTwoAvendasPromoLinkHttp(input: {
  label?: string;
  complimentary_days?: number;
  max_redemptions?: number | null;
}): Promise<TwoAvendasPromoLink> {
  return adminFetch("/api/dashboard/admin/2avendas/promo-links", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchTwoAvendasPromoLinkActiveHttp(input: {
  id: string;
  is_active: boolean;
}): Promise<TwoAvendasPromoLink> {
  return adminFetch(
    `/api/dashboard/admin/2avendas/promo-links/${encodeURIComponent(input.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ is_active: input.is_active }),
    },
  );
}

export async function deleteTwoAvendasPromoLinkHttp(input: {
  id: string;
}): Promise<{ id: string; deleted: boolean }> {
  return adminFetch(
    `/api/dashboard/admin/2avendas/promo-links/${encodeURIComponent(input.id)}`,
    { method: "DELETE" },
  );
}

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

export async function fetchSupportFeedbackHttp(): Promise<SupportFeedbackPayload> {
  return adminFetch("/api/dashboard/admin/feedback");
}

export async function deleteSupportFeedbackHttp(input: {
  source: FeedbackSource;
  id: string;
}): Promise<{ id: string; deleted: boolean }> {
  return adminFetch("/api/dashboard/admin/feedback", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}
