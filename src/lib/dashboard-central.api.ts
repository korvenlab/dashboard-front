import {
  createCentralAccessLinkService,
  getCentralHealth,
  getPublicSupabaseConfig,
  getUnifiedUserDetails,
  listNotifications,
  listRecentPayments,
  listUnifiedUsers,
  mutateNotificationService,
  runCentralAdminCommand,
} from "@/lib/central-service";
import { reconcileCentralProducts } from "@/lib/central-reconcile";
import { z } from "zod";
import {
  isDashboardAuthConfigured,
  isDashboardRequestAuthenticated,
} from "@/lib/dashboard-auth.server";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
};

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

const listSchema = z.object({
  search: z.string().max(200).optional(),
  product: z.string().max(80).optional(),
  status: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const commandSchema = z.object({
  userId: z.string().uuid(),
  productSlug: z.enum(["wagoo", "2avendas"]),
  action: z.enum([
    "role.set",
    "status.set",
    "plan.set",
    "access.grant",
    "user.delete",
  ]),
  params: z.record(z.unknown()).default({}),
  reason: z.string().max(500).optional(),
});

const accessLinkSchema = z.object({
  userId: z.string().uuid(),
  productSlug: z.string().min(1).max(80),
});

const notificationMutationSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["read", "archive"]),
});

/**
 * API HTTP do painel central — mesmo runtime Nitro de `/api/dashboard/metrics`.
 * Evita server functions do TanStack que podem não enxergar as envs de produção.
 */
export async function handleDashboardCentralApi(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (!pathname.startsWith("/api/dashboard/central/")) return null;

  if (
    !isDashboardAuthConfigured() ||
    !isDashboardRequestAuthenticated(request)
  ) {
    return unauthorized();
  }

  try {
    if (
      pathname === "/api/dashboard/central/health" &&
      request.method === "GET"
    ) {
      return jsonOk(getCentralHealth());
    }

    if (
      pathname === "/api/dashboard/central/public-config" &&
      request.method === "GET"
    ) {
      return jsonOk(getPublicSupabaseConfig());
    }

    if (
      pathname === "/api/dashboard/central/users" &&
      request.method === "GET"
    ) {
      const parsed = listSchema.safeParse({
        search: url.searchParams.get("search") ?? undefined,
        product: url.searchParams.get("product") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        page: url.searchParams.get("page") ?? 1,
        limit: url.searchParams.get("limit") ?? 25,
      });
      if (!parsed.success) return jsonError("Parâmetros inválidos.", 400);
      return jsonOk(await listUnifiedUsers(parsed.data));
    }

    const userMatch = pathname.match(
      /^\/api\/dashboard\/central\/users\/([0-9a-f-]{36})$/i,
    );
    if (userMatch && request.method === "GET") {
      return jsonOk(await getUnifiedUserDetails(userMatch[1]));
    }

    if (
      pathname === "/api/dashboard/central/command" &&
      request.method === "POST"
    ) {
      const body = commandSchema.safeParse(await request.json());
      if (!body.success) return jsonError("Payload inválido.", 400);
      return jsonOk(await runCentralAdminCommand(body.data));
    }

    if (
      pathname === "/api/dashboard/central/access-link" &&
      request.method === "POST"
    ) {
      const body = accessLinkSchema.safeParse(await request.json());
      if (!body.success) return jsonError("Payload inválido.", 400);
      return jsonOk(await createCentralAccessLinkService(body.data));
    }

    if (
      pathname === "/api/dashboard/central/notifications" &&
      request.method === "GET"
    ) {
      const includeArchived =
        url.searchParams.get("includeArchived") === "true";
      return jsonOk(await listNotifications(includeArchived));
    }

    if (
      pathname === "/api/dashboard/central/payments" &&
      request.method === "GET"
    ) {
      const productRaw = url.searchParams.get("product");
      const product =
        productRaw === "wagoo" || productRaw === "2avendas"
          ? productRaw
          : undefined;
      const limit = Number(url.searchParams.get("limit") ?? 40);
      return jsonOk(
        await listRecentPayments({
          product,
          limit: Number.isFinite(limit) ? limit : 40,
        }),
      );
    }

    if (
      pathname === "/api/dashboard/central/notifications" &&
      request.method === "POST"
    ) {
      const body = notificationMutationSchema.safeParse(await request.json());
      if (!body.success) return jsonError("Payload inválido.", 400);
      return jsonOk(await mutateNotificationService(body.data));
    }

    if (
      pathname === "/api/dashboard/central/reconcile" &&
      request.method === "POST"
    ) {
      const raw = await request.json().catch(() => ({}));
      const body = z
        .object({
          product: z.enum(["wagoo", "2avendas"]).optional(),
        })
        .safeParse(raw);
      if (!body.success) return jsonError("Payload inválido.", 400);
      const products = body.data.product
        ? ([body.data.product] as ("wagoo" | "2avendas")[])
        : (["wagoo", "2avendas"] as ("wagoo" | "2avendas")[]);
      return jsonOk(await reconcileCentralProducts(products));
    }

    return jsonError("Rota central não encontrada.", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(message, 500);
  }
}
