import { createHmac, timingSafeEqual } from "node:crypto";

export const DASHBOARD_SESSION_COOKIE = "korven_dashboard_session";

const SESSION_MS = 12 * 60 * 60 * 1000;
const SESSION_MAX_AGE_SEC = SESSION_MS / 1000;

export type DashboardAuthEnv = {
  user: string | undefined;
  password: string | undefined;
  sessionSecret: string | undefined;
};

function readCfEnv(): Record<string, string | undefined> | undefined {
  const g = globalThis as typeof globalThis & {
    cloudflare?: { env?: Record<string, string | undefined> };
  };
  return g.cloudflare?.env;
}

function stripEnvNoise(v: string | undefined): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\\n$/g, "").replace(/\n$/g, "").replace(/\r$/g, "").trim() || undefined;
}

function readEnv(key: string): string | undefined {
  const cf = stripEnvNoise(readCfEnv()?.[key]);
  if (cf) return cf;
  if (typeof process !== "undefined" && process.env?.[key]) {
    return stripEnvNoise(process.env[key]);
  }
  return undefined;
}

export function getDashboardAuthEnv(): DashboardAuthEnv {
  return {
    user: readEnv("KORVEN_DASHBOARD_USER"),
    password: readEnv("KORVEN_DASHBOARD_PASSWORD"),
    sessionSecret: readEnv("KORVEN_SESSION_SECRET"),
  };
}

/** Só exige usuário e senha — KORVEN_SESSION_SECRET é opcional (derivado automaticamente). */
export function isDashboardAuthConfigured(): boolean {
  const { user, password } = getDashboardAuthEnv();
  return Boolean(user && password);
}

function deriveSessionSecret(user: string, password: string): string {
  return createHmac("sha256", "korven-dashboard-session-v1")
    .update(`${user}\0${password}`)
    .digest("base64url");
}

function effectiveSessionSecret(): string | undefined {
  const env = getDashboardAuthEnv();
  if (env.sessionSecret) return env.sessionSecret;
  if (env.user && env.password) return deriveSessionSecret(env.user, env.password);
  return undefined;
}

function digestCompare(a: string, b: string): boolean {
  const ha = createHmac("sha256", "korven-dashboard-compare").update(a).digest();
  const hb = createHmac("sha256", "korven-dashboard-compare").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function verifyDashboardCredentials(user: string, password: string): boolean {
  const env = getDashboardAuthEnv();
  if (!env.user || !env.password) return false;
  const userOk = digestCompare(user.trim().toLowerCase(), env.user.trim().toLowerCase());
  const passOk = digestCompare(password, env.password);
  return userOk && passOk;
}

export function createDashboardSessionToken(): string | null {
  const secret = effectiveSessionSecret();
  if (!secret) return null;
  const exp = String(Date.now() + SESSION_MS);
  const sig = createHmac("sha256", secret).update(exp).digest("base64url");
  return `${exp}.${sig}`;
}

export function isDashboardSessionTokenValid(token: string | undefined): boolean {
  const secret = effectiveSessionSecret();
  if (!secret || !token?.trim()) return false;
  const [expRaw, sig] = token.split(".");
  if (!expRaw || !sig) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = createHmac("sha256", secret).update(expRaw).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isProductionDeploy(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.CF_PAGES === "1"
  );
}

export function dashboardSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProductionDeploy(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

function serializeCookie(name: string, value: string, options: ReturnType<typeof dashboardSessionCookieOptions>): string {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path}`,
    "HttpOnly",
    `SameSite=${options.sameSite === "lax" ? "Lax" : "Strict"}`,
    `Max-Age=${options.maxAge}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildDashboardSessionSetCookie(token: string): string {
  return serializeCookie(DASHBOARD_SESSION_COOKIE, token, dashboardSessionCookieOptions());
}

export function buildDashboardSessionClearCookie(): string {
  const secure = isProductionDeploy() ? "; Secure" : "";
  return `${DASHBOARD_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readCookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    if (key === name) return trimmed.slice(eq + 1);
  }
  return undefined;
}

export function isDashboardRequestAuthenticated(request: Request): boolean {
  const token = readCookieFromHeader(request.headers.get("cookie"), DASHBOARD_SESSION_COOKIE);
  return isDashboardSessionTokenValid(token);
}
