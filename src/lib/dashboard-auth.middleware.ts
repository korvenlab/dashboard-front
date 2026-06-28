import { createMiddleware } from "@tanstack/react-start";

/** Bloqueia server functions sem sessão válida quando auth está configurado no servidor. */
export const dashboardAuthMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const auth = await import("@/lib/dashboard-auth.server");
  const { getRequest } = await import("@tanstack/react-start/server");

  if (!auth.isDashboardAuthConfigured()) {
    return next();
  }

  if (!auth.isDashboardRequestAuthenticated(getRequest())) {
    throw new Error("Não autorizado.");
  }

  return next();
});
