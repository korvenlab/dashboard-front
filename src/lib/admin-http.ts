import type { AdminRolesResult, AdminSource, AdminUsersPage } from "@/lib/admin-api";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

function parseError(json: unknown, fallback: string): string {
  if (json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string") {
    return (json as { error: string }).error;
  }
  return fallback;
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

  const res = await fetch(`/api/dashboard/admin/users?${q.toString()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  const json = await readJson<AdminUsersPage & { error?: string }>(res);
  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) {
    throw new Error(parseError(json, `Falha ao carregar usuários (${res.status}).`));
  }
  return json as AdminUsersPage;
}

export async function fetchAdminRolesHttp(source: AdminSource): Promise<AdminRolesResult> {
  const res = await fetch(`/api/dashboard/admin/roles?source=${encodeURIComponent(source)}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  const json = await readJson<AdminRolesResult & { error?: string }>(res);
  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) {
    throw new Error(parseError(json, `Falha ao carregar roles (${res.status}).`));
  }
  return json as AdminRolesResult;
}
