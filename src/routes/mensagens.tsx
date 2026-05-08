import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  deleteSupportFeedbackMessage,
  fetchSupportFeedbackMessages,
  type FeedbackMessageRow,
} from "@/lib/support-feedback-api";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — Korven Console" }] }),
  component: MensagensPage,
});

function sourceBadgeClass(source: FeedbackMessageRow["source"]): string {
  return source === "wagoo"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : "border-sky-500/40 bg-sky-500/10 text-sky-300";
}

function sourceLabel(source: FeedbackMessageRow["source"]): string {
  return source === "wagoo" ? "Wagoo" : "2AVendas";
}

function MensagensPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rows, setRows] = useState<FeedbackMessageRow[]>([]);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const rowKey = (m: FeedbackMessageRow) => `${m.source}:${m.id}`;

  const load = async () => {
    setLoading(true);
    setError("");
    setWarnings([]);
    try {
      const payload = (await fetchSupportFeedbackMessages({ data: {} })) as {
        items: FeedbackMessageRow[];
        warnings: string[];
      };
      setRows(payload.items);
      setWarnings(payload.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function removeMessage(m: FeedbackMessageRow) {
    const ok = confirm("Apagar esta mensagem permanentemente?");
    if (!ok) return;
    setDeletingKey(rowKey(m));
    setError("");
    try {
      await deleteSupportFeedbackMessage({ data: { source: m.source, id: m.id } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div className="space-y-8 p-10">
      <div>
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em] text-foreground">
          Mensagens
        </h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Bugs e sugestões dos apps Wagoo e 2AVendas; cada mensagem indica a origem (API{" "}
          <span className="text-foreground">/feedback/messages</span> em wag-backend e 2A-back).
        </p>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded border border-chart-4/50 bg-chart-4/10 p-4 font-mono text-xs text-chart-4">
          <div className="mb-1 uppercase tracking-wider">Avisos ao carregar uma ou mais origens</div>
          <ul className="list-inside list-disc space-y-1 opacity-90">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded border border-border bg-card/40 p-8 font-mono text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : error ? (
        <div className="rounded border border-chart-3/50 bg-chart-3/10 p-4 font-mono text-xs text-chart-3">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-border bg-card/40 p-8 font-mono text-sm text-muted-foreground">
          Nenhuma mensagem ainda.
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-14rem)] rounded border border-border">
          <div className="divide-y divide-border">
            {rows.map((m) => (
              <article key={rowKey(m)} className="p-4 hover:bg-muted/30">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </div>
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${sourceBadgeClass(m.source)}`}
                    >
                      {sourceLabel(m.source)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[50%]">
                      org {m.organization_id ?? "—"}
                    </div>
                    <button
                      type="button"
                      className="rounded border border-chart-3/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-chart-3 hover:bg-chart-3/10 disabled:opacity-50"
                      disabled={Boolean(deletingKey)}
                      onClick={() => void removeMessage(m)}
                    >
                      {deletingKey === rowKey(m) ? "apagando…" : "apagar"}
                    </button>
                  </div>
                </div>
                <div className="mt-2 font-mono text-xs text-foreground">
                  <span className="text-muted-foreground">
                    {(m.user_full_name ?? "Sem nome").trim()} · {m.user_email ?? m.user_id}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
                  {m.body}
                </p>
              </article>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
