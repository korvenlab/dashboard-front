import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const loginSchema = z.object({
  user: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
});

export const loginDashboard = createServerFn({ method: "POST" })
  .inputValidator(loginSchema)
  .handler(async ({ data }) => {
    const auth = await import("@/lib/dashboard-auth.server");
    const { setResponseHeaders } = await import("@tanstack/react-start/server");
    setResponseHeaders(new Headers({ "Cache-Control": "private, no-store" }));

    if (!auth.isDashboardAuthConfigured()) {
      return { ok: false as const, error: "Login não configurado no servidor." };
    }

    if (!auth.verifyDashboardCredentials(data.user, data.password)) {
      return { ok: false as const, error: "Credenciais inválidas." };
    }

    const token = auth.createDashboardSessionToken();
    if (!token) {
      return { ok: false as const, error: "Sessão indisponível." };
    }

    setResponseHeaders(
      new Headers({
        "Cache-Control": "private, no-store",
        "Set-Cookie": auth.buildDashboardSessionSetCookie(token),
      }),
    );

    return { ok: true as const };
  });

export const logoutDashboard = createServerFn({ method: "POST" }).handler(async () => {
  const auth = await import("@/lib/dashboard-auth.server");
  const { setResponseHeaders } = await import("@tanstack/react-start/server");
  setResponseHeaders(
    new Headers({
      "Cache-Control": "private, no-store",
      "Set-Cookie": auth.buildDashboardSessionClearCookie(),
    }),
  );
  return { ok: true as const };
});

export const getDashboardAuthStatus = createServerFn({ method: "GET" }).handler(async () => {
    const auth = await import("@/lib/dashboard-auth.server");
    const { getRequest, setResponseHeaders } = await import("@tanstack/react-start/server");
    setResponseHeaders(new Headers({ "Cache-Control": "private, no-store" }));
    return {
      authenticated: auth.isDashboardRequestAuthenticated(getRequest()),
      configured: auth.isDashboardAuthConfigured(),
    };
  });
