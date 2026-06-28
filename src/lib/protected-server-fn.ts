import { createServerFn } from "@tanstack/react-start";
import { dashboardAuthMiddleware } from "@/lib/dashboard-auth.middleware";

/** Server function que exige sessão do dashboard (não expõe segredos ao browser). */
export function protectedServerFn<M extends "GET" | "POST">(method: M) {
  return createServerFn({ method }).middleware([dashboardAuthMiddleware]);
}
