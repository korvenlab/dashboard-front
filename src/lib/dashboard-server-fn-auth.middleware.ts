import { createMiddleware } from "@tanstack/react-start";

/**
 * Autentica server functions via cookie HttpOnly no Request HTTP real
 * (function middleware não recebe o cookie de forma confiável).
 */
export const dashboardServerFnAuthMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    if (request.headers.get("x-tsr-serverFn") !== "true") {
      return next();
    }

    const auth = await import("@/lib/dashboard-auth.server");
    if (!auth.isDashboardAuthConfigured()) {
      return next();
    }

    if (!auth.isDashboardRequestAuthenticated(request)) {
      throw new Error("Não autorizado.");
    }

    return next();
  },
);
