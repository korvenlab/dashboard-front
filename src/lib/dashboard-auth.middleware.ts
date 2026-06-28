import { createMiddleware } from "@tanstack/react-start";

/** Bloqueia server functions sem sessão válida (cookie HttpOnly assinado no servidor). */
export const dashboardAuthMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const [{ isDashboardRequestAuthenticated }, { getRequest }] = await Promise.all([
    import("@/lib/dashboard-auth.server"),
    import("@tanstack/react-start/server"),
  ]);

  if (!isDashboardRequestAuthenticated(getRequest())) {
    throw new Error("Não autorizado.");
  }

  return next();
});
