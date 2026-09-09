import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { RevenueAreaChart, VolumeBarChart } from "@/components/metrics-charts";
import { EventsTable } from "@/components/events-table";
import {
  KorvenDashboardEmptyHint,
  useKorvenDashboard,
} from "@/lib/dashboard-context";
import {
  fetchUnifiedUsersHttp,
  reconcileCentralHttp,
} from "@/lib/central-http";
import type { UnifiedUser } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function Index() {
  const { dashboard, refresh } = useKorvenDashboard();
  const [users, setUsers] = useState<UnifiedUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function loadUsers() {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const page = await fetchUnifiedUsersHttp({ page: 1, limit: 12 });
      setUsers(page.items);
      setUsersTotal(page.total);
      if (page.total === 0) {
        setSyncMessage(
          "Nenhum usuário no banco central ainda. Clique em Sincronizar para importar Wagoo e 2AVendas.",
        );
      }
    } catch (cause) {
      setUsers([]);
      setUsersTotal(0);
      setUsersError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function syncNow() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await reconcileCentralHttp();
      const summary = result.results
        .map(
          (item) =>
            `${item.product}: ${item.upserted}/${item.seen}` +
            (item.errors.length ? ` (${item.errors.length} erros)` : ""),
        )
        .join(" · ");
      setSyncMessage(
        `Sync ok · ${summary} · total unificado: ${result.unifiedUsers}`,
      );
      await Promise.all([loadUsers(), refresh()]);
    } catch (cause) {
      setSyncMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSyncing(false);
    }
  }

  if (!dashboard) {
    return (
      <div className="space-y-6 p-10">
        <KorvenDashboardEmptyHint />
        <div className="mx-auto max-w-lg border border-border p-4">
          <p className="font-mono text-xs text-muted-foreground">
            Enquanto as métricas carregam, você já pode sincronizar usuários no
            banco central.
          </p>
          <Button
            className="mt-3 rounded-none font-mono text-xs"
            disabled={syncing}
            onClick={() => void syncNow()}
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
            />
            Sincronizar usuários agora
          </Button>
          {syncMessage ? (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              {syncMessage}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const chartDays = dashboard.meta.filtros.chart_days;
  const topRow = dashboard.kpis.slice(0, 4);
  const wagooKpi =
    dashboard.kpis.find((k) => k.label.toLowerCase().includes("wagoo")) ??
    dashboard.kpis[1];
  const vendasKpi =
    dashboard.kpis.find((k) => k.label.toLowerCase().includes("2avendas")) ??
    dashboard.kpis[2];

  return (
    <div className="space-y-10 p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em] text-foreground">
            Visão Geral
          </h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Fonte:{" "}
            <span className="text-foreground">
              {dashboard.meta.source === "supabase"
                ? "Supabase central"
                : dashboard.meta.source}
            </span>
            {" · "}
            usuários unificados via{" "}
            <code className="text-foreground">/api/dashboard/central/*</code>
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-none font-mono text-xs"
          disabled={syncing}
          onClick={() => void syncNow()}
        >
          <RefreshCw
            className={`mr-2 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
          />
          Sincronizar produtos
        </Button>
      </div>

      {syncMessage ? (
        <div className="border border-border bg-card/40 p-3 font-mono text-[11px] text-muted-foreground">
          {syncMessage}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
        {topRow.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </section>

      <section className="space-y-4">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="font-mono text-sm uppercase tracking-[0.3em] text-foreground">
              Usuários recentes
            </h2>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {usersTotal} no central · emails e contas por produto
            </p>
          </div>
          <Link
            to="/admin"
            className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
          >
            Abrir Admin
          </Link>
        </header>

        {usersError ? (
          <div className="border border-rose-500/40 bg-rose-500/10 p-3 font-mono text-xs text-rose-300">
            {usersError}
          </div>
        ) : null}

        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-border bg-card">
              <tr>
                {[
                  "Nome / email",
                  "Produtos",
                  "Status",
                  "Plano",
                  "Último login",
                ].map((title) => (
                  <th
                    key={title}
                    className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider"
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border/60 hover:bg-card/40"
                >
                  <td className="px-3 py-3">
                    <p className="text-sm">{user.name ?? "Sem nome"}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {user.email ?? user.id}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.products.map((slug) => (
                        <Badge
                          key={slug}
                          variant="secondary"
                          className="rounded-none font-mono text-[9px]"
                        >
                          {slug}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px]">
                    {user.status ?? "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {user.plan ?? "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">
                    {formatDate(user.last_login_at)}
                  </td>
                </tr>
              ))}
              {!usersLoading && users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center font-mono text-xs text-muted-foreground"
                  >
                    Sem usuários no central. Use Sincronizar produtos.
                  </td>
                </tr>
              ) : null}
              {usersLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center font-mono text-xs text-primary"
                  >
                    Carregando usuários…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="h-px w-full bg-border" />

      <section className="space-y-6">
        <header className="flex items-baseline justify-between">
          <h2 className="font-mono text-sm uppercase tracking-[0.3em] text-foreground">
            Wagoo
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            receita por dia
          </span>
        </header>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {wagooKpi ? <KpiCard {...wagooKpi} /> : null}
          <div className="lg:col-span-2">
            <RevenueAreaChart
              data={dashboard.wagooReceitaPorDia}
              chartDays={chartDays}
            />
          </div>
        </div>
      </section>

      <div className="h-px w-full bg-border" />

      <section className="space-y-6">
        <header className="flex items-baseline justify-between">
          <h2 className="font-mono text-sm tracking-[0.2em] text-foreground">
            2AVendas
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            desempenho de cadastro (período)
          </span>
        </header>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {vendasKpi ? <KpiCard {...vendasKpi} /> : null}
          <div className="lg:col-span-2">
            <VolumeBarChart
              data={dashboard.avendasVolumePorDia}
              chartDays={chartDays}
            />
          </div>
        </div>
      </section>

      <div className="h-px w-full bg-border" />

      <section>
        <EventsTable events={dashboard.events} />
      </section>
    </div>
  );
}
