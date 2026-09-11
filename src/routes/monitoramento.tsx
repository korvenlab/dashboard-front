import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  fetchMpWebhookMonitoring,
  fetchUptimeMonitoring,
  type MpWebhookMonitorResponse,
  type UptimeMonitoringResponse,
} from "@/lib/monitoring-api";

export const Route = createFileRoute("/monitoramento")({
  component: MonitoringPage,
});

function statusClass(status: string): string {
  if (status.toLowerCase() === "online") return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (status.toLowerCase() === "offline") return "border-rose-500/50 bg-rose-500/10 text-rose-300";
  return "border-amber-500/50 bg-amber-500/10 text-amber-300";
}

function healthClass(healthy: boolean | null): string {
  if (healthy === true) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (healthy === false) return "border-rose-500/50 bg-rose-500/10 text-rose-300";
  return "border-amber-500/50 bg-amber-500/10 text-amber-300";
}

function healthLabel(healthy: boolean | null): string {
  if (healthy === true) return "Recente";
  if (healthy === false) return "Sem eventos >48h";
  return "Sem dados / silencioso";
}

function formatAge(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h`;
  return `${Math.round(sec / 86400)} d`;
}

function countRecentIncidents(logs: unknown[]): number {
  return logs.reduce<number>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const status = (item as { type?: number | string }).type;
    const statusCode = Number(status);
    return statusCode === 1 || statusCode === 2 ? acc + 1 : acc;
  }, 0);
}

function latestResponseMs(responseTimes: unknown[]): number | null {
  for (let i = responseTimes.length - 1; i >= 0; i -= 1) {
    const item = responseTimes[i];
    if (!item || typeof item !== "object") continue;
    const value = Number((item as { value?: number | string }).value);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function MonitoringPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<UptimeMonitoringResponse | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const [mpLoading, setMpLoading] = useState(false);
  const [mpError, setMpError] = useState("");
  const [mpData, setMpData] = useState<MpWebhookMonitorResponse | null>(null);
  const [mpLoadedOnce, setMpLoadedOnce] = useState(false);

  const load = async (opts?: { force_refresh?: boolean; full?: boolean }) => {
    setLoading(true);
    setError("");
    try {
      const result = (await fetchUptimeMonitoring({
        data: {
          force_refresh: opts?.force_refresh,
          full: opts?.full,
        },
      })) as UptimeMonitoringResponse;
      setData(result);
      setLoadedOnce(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadMp = async () => {
    setMpLoading(true);
    setMpError("");
    try {
      const result = (await fetchMpWebhookMonitoring({
        data: { limit: 40 },
      })) as MpWebhookMonitorResponse;
      setMpData(result);
      setMpLoadedOnce(true);
    } catch (e) {
      setMpError(e instanceof Error ? e.message : String(e));
      setMpData(null);
    } finally {
      setMpLoading(false);
    }
  };

  const topicEntries = mpData
    ? Object.entries(mpData.summary.by_topic_24h).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em]">Monitoramento</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            UptimeRobot + saúde dos webhooks Mercado Pago (Wagoo). Sem extrato financeiro — só ops.
          </p>
        </div>
      </div>

      {/* —— Mercado Pago webhooks —— */}
      <section className="space-y-4 rounded border border-border bg-card/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.15em]">
              Mercado Pago · webhooks
            </h2>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Eventos recebidos em{" "}
              <code className="text-[10px]">/api/mercadopago/webhook</code> (tópico, id, live/test).
              Pagamentos e clube ficam em /wagoo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMp()}
            className="rounded border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider hover:bg-card"
            disabled={mpLoading}
          >
            {mpLoading ? "Carregando..." : mpLoadedOnce ? "Recarregar MP" : "Carregar MP"}
          </button>
        </div>

        {mpError ? (
          <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-300">
            {mpError}
          </div>
        ) : null}

        {!mpLoadedOnce && !mpLoading ? (
          <p className="font-mono text-xs text-muted-foreground">
            Clique em Carregar MP para ver os últimos webhooks.
          </p>
        ) : null}

        {mpData ? (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded border border-border bg-card/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Eventos 24h
                </div>
                <div className="mt-1 font-mono text-2xl">{mpData.summary.last_24h_total}</div>
              </div>
              <div className="rounded border border-border bg-card/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Último webhook
                </div>
                <div className="mt-1 font-mono text-sm">
                  {mpData.summary.last_received_at
                    ? new Date(mpData.summary.last_received_at).toLocaleString("pt-BR")
                    : "—"}
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  há {formatAge(mpData.summary.last_received_age_sec)}
                </div>
              </div>
              <div className="rounded border border-border bg-card/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Saúde do pipeline
                </div>
                <div className="mt-2">
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-xs ${healthClass(mpData.summary.healthy)}`}
                  >
                    {healthLabel(mpData.summary.healthy)}
                  </span>
                </div>
              </div>
              <div className="rounded border border-border bg-card/40 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Tópicos 24h
                </div>
                <div className="mt-2 space-y-1">
                  {topicEntries.length === 0 ? (
                    <span className="font-mono text-xs text-muted-foreground">Nenhum</span>
                  ) : (
                    topicEntries.slice(0, 6).map(([topic, n]) => (
                      <div key={topic} className="flex justify-between gap-2 font-mono text-[11px]">
                        <span className="truncate text-muted-foreground">{topic}</span>
                        <span>{n}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                      Quando
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                      Tópico
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                      Data ID
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                      Modo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mpData.events.map((e) => (
                    <tr key={`${e.id}-${e.data_id}`} className="border-b border-border/50">
                      <td className="px-3 py-2 font-mono text-xs">
                        {new Date(e.processed_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{e.topic}</td>
                      <td className="px-3 py-2 font-mono text-xs">{e.data_id}</td>
                      <td className="px-3 py-2 font-mono text-xs">{e.action ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {e.live_mode === true ? "live" : e.live_mode === false ? "test" : "—"}
                      </td>
                    </tr>
                  ))}
                  {mpData.events.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center font-mono text-xs text-muted-foreground"
                      >
                        Nenhum webhook registrado ainda.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {mpData.runtime_signals.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Sinais runtime (processo)
                </h3>
                <ul className="space-y-1">
                  {mpData.runtime_signals.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-baseline gap-2 rounded border border-border/60 bg-card/30 px-3 py-1.5 font-mono text-[11px]"
                    >
                      <span className={`rounded border px-1.5 ${statusClass(s.status)}`}>
                        {s.status}
                      </span>
                      <span className="text-muted-foreground">
                        {s.timestamp
                          ? new Date(s.timestamp).toLocaleString("pt-BR")
                          : ""}
                      </span>
                      <span>{s.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {/* —— UptimeRobot —— */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.15em]">
              UptimeRobot
            </h2>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Cache ~10 min no servidor. Carregue só quando precisar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load({ force_refresh: false })}
              className="rounded border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider hover:bg-card"
              disabled={loading}
            >
              {loading ? "Carregando..." : loadedOnce ? "Recarregar (cache)" : "Carregar"}
            </button>
            <button
              type="button"
              onClick={() => void load({ force_refresh: true, full: true })}
              className="rounded border border-primary/40 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-primary hover:bg-primary/10"
              disabled={loading}
              title="Consulta completa UptimeRobot (logs e latência)"
            >
              Atualizar tudo
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-300">
            {error}
          </div>
        ) : null}

        {!loadedOnce && !loading ? (
          <p className="font-mono text-xs text-muted-foreground">
            Clique em Carregar para ver os monitores. A página não busca dados automaticamente.
          </p>
        ) : null}

        {data ? (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded border border-border bg-card/40 p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Total de monitores
              </div>
              <div className="mt-1 font-mono text-2xl">{data.total}</div>
            </div>
            <div className="rounded border border-border bg-card/40 p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Status API
              </div>
              <div className="mt-1 font-mono text-2xl">{data.stat}</div>
            </div>
            <div className="rounded border border-border bg-card/40 p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Última atualização
              </div>
              <div className="mt-1 font-mono text-sm">
                {new Date(data.fetchedAt).toLocaleString("pt-BR")}
              </div>
            </div>
          </section>
        ) : null}

        <section className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                  Monitor
                </th>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                  Código
                </th>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                  URL
                </th>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                  Uptime
                </th>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                  Intervalo
                </th>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                  Incidentes
                </th>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                  Latência Atual
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.monitors.map((m) => {
                const currentMs = latestResponseMs(m.responseTimes);
                return (
                  <tr key={`${m.id ?? m.name}`} className="border-b border-border/50">
                    <td className="px-3 py-2 font-mono text-xs">{m.name}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded border px-2 py-0.5 font-mono text-xs ${statusClass(m.status)}`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{m.statusCode}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.url ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.uptimeRatio ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.interval ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {countRecentIncidents(m.logs)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {currentMs !== null ? `${currentMs} ms` : "—"}
                    </td>
                  </tr>
                );
              })}
              {!loading && loadedOnce && (!data || data.monitors.length === 0) ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center font-mono text-xs text-muted-foreground"
                  >
                    Nenhum monitor retornado pela API.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}
