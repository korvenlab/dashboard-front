import { createServerFn } from "@tanstack/react-start";

/** Server function protegida por dashboardServerFnAuthMiddleware em src/start.ts */
export function protectedServerFn<M extends "GET" | "POST">(method: M) {
  return createServerFn({ method });
}
