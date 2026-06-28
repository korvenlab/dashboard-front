import {
  buildDashboardSessionClearCookie,
  buildDashboardSessionSetCookie,
  createDashboardSessionToken,
  isDashboardAuthConfigured,
  isDashboardRequestAuthenticated,
  verifyDashboardCredentials,
} from "./dashboard-auth.server";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
};

export async function handleDashboardAuthApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/dashboard/auth-status" && request.method === "GET") {
    const configured = isDashboardAuthConfigured();
    const body = configured
      ? { authenticated: isDashboardRequestAuthenticated(request), configured: true }
      : { authenticated: true, configured: false };
    return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
  }

  if (pathname === "/api/dashboard/login" && request.method === "POST") {
    if (!isDashboardAuthConfigured()) {
      return new Response(
        JSON.stringify({ ok: false, error: "Login não configurado no servidor." }),
        { status: 503, headers: JSON_HEADERS },
      );
    }

    let payload: { user?: string; password?: string };
    try {
      payload = (await request.json()) as { user?: string; password?: string };
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Corpo inválido." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const user = payload.user?.trim() ?? "";
    const password = payload.password ?? "";
    if (!user || !password) {
      return new Response(JSON.stringify({ ok: false, error: "Credenciais inválidas." }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    if (!verifyDashboardCredentials(user, password)) {
      return new Response(JSON.stringify({ ok: false, error: "Credenciais inválidas." }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const token = createDashboardSessionToken();
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Sessão indisponível." }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    const headers = new Headers(JSON_HEADERS);
    headers.append("set-cookie", buildDashboardSessionSetCookie(token));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  if (pathname === "/api/dashboard/logout" && request.method === "POST") {
    const headers = new Headers(JSON_HEADERS);
    headers.append("set-cookie", buildDashboardSessionClearCookie());
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  return null;
}
