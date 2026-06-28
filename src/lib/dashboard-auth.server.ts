import { createHmac, timingSafeEqual } from "node:crypto";

export const DASHBOARD_SESSION_COOKIE = "korven_dashboard_session";

const SESSION_MS = 12 * 60 * 60 * 1000;

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

function readEnv(key: string): string | undefined {
  const cf = readCfEnv()?.[key];
  if (cf?.trim()) return cf.trim();
  if (typeof process !== "undefined" && process.env?.[key]?.trim()) {
    return process.env[key]!.trim();
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
  const userOk = timingSafeEqualStr(user, env.user);
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

function isProductionDeploy(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.CF_PAGES === "1"
  );
}

export function buildDashboardSessionSetCookie(token: string): string {
  const secure = isProductionDeploy() ? "; Secure" : "";
  return `${DASHBOARD_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure}`;
}

export function buildDashboardSessionClearCookie(): string {
  const secure = isProductionDeploy() ? "; Secure" : "";
  return `${DASHBOARD_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
