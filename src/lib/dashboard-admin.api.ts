import { z } from "zod";
import {
  isDashboardAuthConfigured,
  isDashboardRequestAuthenticated,
} from "@/lib/dashboard-auth.server";
import {
  createTwoAvendasPromoLinkService,
  createWagooPromoLinkService,
  deleteTwoAvendasPromoLinkService,
  deleteWagooPromoLinkService,
  listAdminRoles,
  listAdminUsers,
  listTwoAvendasPromoLinks,
  listWagooPromoLinks,
  patchTwoAvendasPromoLinkActiveService,
  patchWagooPromoLinkActiveService,
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
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  });
}

const createPromoBodySchema = z.object({
  label: z.string().max(200).optional(),
  complimentary_days: z.number().int().min(1).max(730).optional(),
  max_redemptions: z.number().int().min(1).optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

const patchPromoBodySchema = z.object({
  is_active: z.boolean(),
});

/**
 * Admin HTTP — mesmo runtime Nitro de `/api/dashboard/metrics`.
 * Promo links não usam createServerFn (env vazia no browser).
 */
export async function handleDashboardAdminApi(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (!pathname.startsWith("/api/dashboard/admin/")) {
    return null;
  }

  if (
    !isDashboardAuthConfigured() ||
    !isDashboardRequestAuthenticated(request)
  ) {
    return unauthorized();
  }

  try {
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

      const page = await listAdminUsers(parsed.data);
      return jsonOk(page);
    }

    if (pathname === "/api/dashboard/admin/roles" && request.method === "GET") {
      const source = sourceSchema.safeParse(url.searchParams.get("source"));
      if (!source.success) {
        return jsonError("Parâmetro source inválido.", 400);
      }
      const roles = await listAdminRoles(source.data);
      return jsonOk(roles);
    }

    if (
      pathname === "/api/dashboard/admin/wagoo/promo-links" &&
      request.method === "GET"
    ) {
      return jsonOk(await listWagooPromoLinks());
    }

    if (
      pathname === "/api/dashboard/admin/wagoo/promo-links" &&
      request.method === "POST"
    ) {
      const body = createPromoBodySchema.safeParse(await request.json());
      if (!body.success) return jsonError("Payload inválido.", 400);
      return jsonOk(await createWagooPromoLinkService(body.data), 201);
    }

    const wagooPromoMatch = pathname.match(
      /^\/api\/dashboard\/admin\/wagoo\/promo-links\/([^/]+)$/,
    );
    if (wagooPromoMatch) {
      const id = decodeURIComponent(wagooPromoMatch[1] ?? "");
      if (!id) return jsonError("id inválido.", 400);
      if (request.method === "PATCH") {
        const body = patchPromoBodySchema.safeParse(await request.json());
        if (!body.success) return jsonError("Payload inválido.", 400);
        return jsonOk(
          await patchWagooPromoLinkActiveService({
            id,
            is_active: body.data.is_active,
          }),
        );
      }
      if (request.method === "DELETE") {
        return jsonOk(await deleteWagooPromoLinkService({ id }));
      }
    }

    if (
      pathname === "/api/dashboard/admin/2avendas/promo-links" &&
      request.method === "GET"
    ) {
      return jsonOk(await listTwoAvendasPromoLinks());
    }

    if (
      pathname === "/api/dashboard/admin/2avendas/promo-links" &&
      request.method === "POST"
    ) {
      const body = createPromoBodySchema.safeParse(await request.json());
      if (!body.success) return jsonError("Payload inválido.", 400);
      return jsonOk(await createTwoAvendasPromoLinkService(body.data), 201);
    }

    const twoPromoMatch = pathname.match(
      /^\/api\/dashboard\/admin\/2avendas\/promo-links\/([^/]+)$/,
    );
    if (twoPromoMatch) {
      const id = decodeURIComponent(twoPromoMatch[1] ?? "");
      if (!id) return jsonError("id inválido.", 400);
      if (request.method === "PATCH") {
        const body = patchPromoBodySchema.safeParse(await request.json());
        if (!body.success) return jsonError("Payload inválido.", 400);
        return jsonOk(
          await patchTwoAvendasPromoLinkActiveService({
            id,
            is_active: body.data.is_active,
          }),
        );
      }
      if (request.method === "DELETE") {
        return jsonOk(await deleteTwoAvendasPromoLinkService({ id }));
      }
    }

    return jsonError("Rota admin não encontrada.", 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, 502);
  }
}

export type { AdminUsersPage, AdminRolesResult, AdminSource };
