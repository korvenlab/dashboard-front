export type DashboardAuthStatus = {
  authenticated: boolean;
  configured: boolean;
};

export type DashboardLoginResult =
  | { ok: true }
  | { ok: false; error: string };

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function fetchDashboardAuthStatus(): Promise<DashboardAuthStatus> {
  const res = await fetch("/api/dashboard/auth-status", {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error("Falha ao verificar sessão.");
  return readJson<DashboardAuthStatus>(res);
}

export async function postDashboardLogin(user: string, password: string): Promise<DashboardLoginResult> {
  const res = await fetch("/api/dashboard/login", {
    method: "POST",
    credentials: "include",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ user, password }),
  });
  const body = await readJson<DashboardLoginResult>(res);
  if (!res.ok) {
    return { ok: false, error: body.ok === false ? body.error : "Credenciais inválidas." };
  }
  return body.ok ? body : { ok: false, error: "Resposta inválida." };
}

export async function postDashboardLogout(): Promise<void> {
  await fetch("/api/dashboard/logout", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json" },
  });
}
