import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useState } from "react";

import appCss from "../styles.css?url";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardTopbar } from "@/components/dashboard-topbar";
import { fetchKorvenDashboard } from "@/lib/dashboard-api";
import { parseRootSearch } from "@/lib/root-search";
import type { DashboardViewModel } from "@/lib/dashboard-view";
import type { RootLoaderData } from "@/lib/root-loader-data";

const LOGIN_USER = "admin";
const LOGIN_PASS = "2002Dhcp?";
const AUTH_COOKIE = "korven_dashboard_auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

function hasAuthCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${AUTH_COOKIE}=1`));
}

function LoginPanel({ onSuccess }: { onSuccess: () => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (user === LOGIN_USER && pass === LOGIN_PASS) {
      if (typeof document !== "undefined") {
        document.cookie = `${AUTH_COOKIE}=1; Path=/; Max-Age=43200; SameSite=Lax`;
      }
      setError("");
      onSuccess();
      return;
    }
    setError("Credenciais inválidas.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded border border-border bg-card/40 p-6 backdrop-blur">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img
            src="/korven-wordmark.png"
            alt="Korven Lab"
            className="h-20 w-auto object-contain"
            onError={(e) => {
              e.currentTarget.src = "/korven-logo.svg";
            }}
          />
          <h1 className="font-mono text-sm uppercase tracking-[0.35em] text-foreground">Acesso ao Dashboard</h1>
        </div>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            className="h-10 w-full rounded border border-border bg-background px-3 font-mono text-sm"
            placeholder="Usuário"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
          />
          <input
            className="h-10 w-full rounded border border-border bg-background px-3 font-mono text-sm"
            placeholder="Senha"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
          />
          {error ? (
            <div className="rounded border border-chart-3/50 bg-chart-3/10 px-2 py-1 font-mono text-xs text-chart-3">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            className="h-10 w-full rounded border border-primary/50 bg-primary/10 font-mono text-xs uppercase tracking-widest text-primary hover:bg-primary/20"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: (search) => parseRootSearch(search as Record<string, unknown>),
  loaderDeps: ({ search }) => ({ search }),
  staleTime: 30_000,
  loader: async ({ deps }): Promise<RootLoaderData> => {
    const { organization_id, period_days, chart_days } = deps.search;

    const dashboard = (await fetchKorvenDashboard({
      data: {
        organization_id,
        period_days,
        chart_days,
      },
    })) as DashboardViewModel;

    return { dashboard };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Korven Lab // Console" },
      {
        name: "description",
        content:
          "Painel administrativo Korven Lab — métricas e eventos Wagoo (wag-backend) e 2AVendas (2A-back).",
      },
      { name: "author", content: "Korven Lab" },
      { property: "og:title", content: "Korven Lab // Console" },
      { property: "og:description", content: "Painel administrativo industrial da Korven Lab." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/korven-logo.png" },
      { rel: "icon", type: "image/svg+xml", href: "/korven-logo.svg" },
      { rel: "shortcut icon", href: "/korven-logo.png" },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { dashboard } = Route.useLoaderData();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    setAuthenticated(hasAuthCookie());
  }, []);

  const loginView = useMemo(
    () => <LoginPanel onSuccess={() => setAuthenticated(true)} />,
    [],
  );
  const handleLogout = () => {
    if (typeof document !== "undefined") {
      document.cookie = `${AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
    setAuthenticated(false);
  };

  const banner = dashboard?.meta.message?.trim() ? dashboard.meta.message : null;

  if (!authenticated) return loginView;

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar dynamicItems={dashboard?.ui.sidebar_itens} onLogout={handleLogout} />
          <div className="flex min-h-screen flex-1 flex-col">
            <DashboardTopbar
              generatedAt={dashboard?.meta.gerado_em}
              topbarUi={dashboard?.ui.topbar}
            />
            {banner ? (
              <div className="border-b border-chart-4/50 bg-chart-4/10 px-4 py-2 font-mono text-[11px] text-chart-4">
                {banner}
              </div>
            ) : null}
            <main className="flex-1 bg-background">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </QueryClientProvider>
  );
}
