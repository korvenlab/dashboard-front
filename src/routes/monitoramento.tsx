import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { fetchUptimeMonitoring, type UptimeMonitoringResponse } from "@/lib/monitoring-api";

export const Route = createFileRoute("/monitoramento")({
  component: MonitoringPage,
});

function statusClass(status: string): string {
  if (status.toLowerCase() === "online") return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (status.toLowerCase() === "offline") return "border-rose-500/50 bg-rose-500/10 text-rose-300";
  return "border-amber-500/50 bg-amber-500/10 text-amber-300";
}

function MonitoringPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<UptimeMonitoringResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = (await fetchUptimeMonitoring({ data: {} })) as UptimeMonitoringResponse;
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em]">Monitoramento</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Visão completa dos monitores via API do UptimeRobot.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider hover:bg-card"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {error ? (
        <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-300">
          {error}
        </div>
      ) : null}

      {data ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Total de monitores</div>
            <div className="mt-1 font-mono text-2xl">{data.total}</div>
          </div>
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status API</div>
            <div className="mt-1 font-mono text-2xl">{data.stat}</div>
          </div>
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Última atualização</div>
            <div className="mt-1 font-mono text-sm">{new Date(data.fetchedAt).toLocaleString("pt-BR")}</div>
          </div>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Monitor</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Status</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Código</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">URL</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Uptime</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Intervalo</th>
            </tr>
          </thead>
          <tbody>
            {data?.monitors.map((m) => (
              <tr key={`${m.id ?? m.name}`} className="border-b border-border/50">
                <td className="px-3 py-2 font-mono text-xs">{m.name}</td>
                <td className="px-3 py-2">
                  <span className={`rounded border px-2 py-0.5 font-mono text-xs ${statusClass(m.status)}`}>
                    {m.status}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{m.statusCode}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.url ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.uptimeRatio ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.interval ?? "—"}</td>
              </tr>
            ))}
            {!loading && (!data || data.monitors.length === 0) ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
                  Nenhum monitor retornado pela API.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {data ? (
        <section className="rounded border border-border bg-card/40 p-3">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">Payload completo (raw)</h2>
          <pre className="max-h-[420px] overflow-auto rounded border border-border/60 bg-background p-3 font-mono text-[11px]">
            {JSON.stringify(data.raw, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
