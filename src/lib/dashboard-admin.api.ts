import { z } from "zod";
import {
  isDashboardAuthConfigured,
  isDashboardRequestAuthenticated,
} from "@/lib/dashboard-auth.server";
import {
  listAdminRoles,
  listAdminUsers,
  type AdminRolesResult,
  type AdminSource,
  type AdminUsersPage,
} from "@/lib/admin-api";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
};

const sourceSchema = z.enum(["wagoo", "2avendas"]);

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Não autorizado." }), {
    status: 401,
    headers: JSON_HEADERS,
  });
}

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function jsonError(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}

/** Lista roles via rota HTTP (mesmo runtime que métricas Stripe). */
async function listAdminRolesHttp(source: AdminSource): Promise<AdminRolesResult> {
  return listAdminRoles(source);
}

export async function handleDashboardAdminApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (!pathname.startsWith("/api/dashboard/admin/")) {
    return null;
  }

  if (isDashboardAuthConfigured() && !isDashboardRequestAuthenticated(request)) {
    return unauthorized();
  }

  if (pathname === "/api/dashboard/admin/users" && request.method === "GET") {
    const parsed = z
      .object({
        source: sourceSchema,
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).max(1000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse({
        source: url.searchParams.get("source") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        page: url.searchParams.get("page") ?? 1,
        limit: url.searchParams.get("limit") ?? 20,
      });

    if (!parsed.success) {
      return jsonError("Parâmetros inválidos.", 400);
    }

    try {
      const page = await listAdminUsers(parsed.data);
      return jsonOk(page);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonError(msg, 502);
    }
  }

  if (pathname === "/api/dashboard/admin/roles" && request.method === "GET") {
    const source = sourceSchema.safeParse(url.searchParams.get("source"));
    if (!source.success) {
      return jsonError("Parâmetro source inválido.", 400);
    }
    try {
      const roles = await listAdminRolesHttp(source.data);
      return jsonOk(roles);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonError(msg, 502);
    }
  }

  return jsonError("Rota admin não encontrada.", 404);
}

export type { AdminUsersPage };
