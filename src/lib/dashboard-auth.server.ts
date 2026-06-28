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

function sessionSecret(): string | undefined {
  return getDashboardAuthEnv().sessionSecret;
}

export function isDashboardAuthConfigured(): boolean {
  const { user, password, sessionSecret: secret } = getDashboardAuthEnv();
  return Boolean(user && password && secret);
}

export function verifyDashboardCredentials(user: string, password: string): boolean {
  const env = getDashboardAuthEnv();
  if (!env.user || !env.password || !env.sessionSecret) return false;
  const userOk = timingSafeEqualStr(user.trim(), env.user);
  const passOk = timingSafeEqualStr(password, env.password);
  return userOk && passOk;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function createDashboardSessionToken(): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const exp = String(Date.now() + SESSION_MS);
  const sig = createHmac("sha256", secret).update(exp).digest("base64url");
  return `${exp}.${sig}`;
}

export function isDashboardSessionTokenValid(token: string | undefined): boolean {
  const secret = sessionSecret();
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
    `${name}=${encodeURIComponent(value)}`,
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
    if (key === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return undefined;
}

export function isDashboardRequestAuthenticated(request: Request): boolean {
  const token = readCookieFromHeader(request.headers.get("cookie"), DASHBOARD_SESSION_COOKIE);
  return isDashboardSessionTokenValid(token);
}

export async function readDashboardSessionToken(): Promise<string | undefined> {
  const { getCookie } = await import("@tanstack/react-start/server");
  return getCookie(DASHBOARD_SESSION_COOKIE) || undefined;
}

export async function issueDashboardSessionCookie(token: string): Promise<void> {
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(DASHBOARD_SESSION_COOKIE, token, dashboardSessionCookieOptions());
}

export async function clearDashboardSessionCookie(): Promise<void> {
  const { deleteCookie } = await import("@tanstack/react-start/server");
  deleteCookie(DASHBOARD_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionDeploy(),
    path: "/",
  });
}

export async function isDashboardSessionActive(request?: Request): Promise<boolean> {
  if (!isDashboardAuthConfigured()) return true;
  if (request) {
    return isDashboardRequestAuthenticated(request);
  }
  const token = await readDashboardSessionToken();
  return isDashboardSessionTokenValid(token);
}
