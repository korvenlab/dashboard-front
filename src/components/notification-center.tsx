import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import {
  fetchNotificationsHttp,
  fetchSupabasePublicConfigHttp,
  mutateNotificationHttp,
} from "@/lib/central-http";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Notification } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function severityLabel(level: string | null): string | null {
  if (!level) return null;
  const map: Record<string, string> = {
    info: "Info",
    success: "Sucesso",
    warning: "Atenção",
    error: "Erro",
    critical: "Crítico",
  };
  return map[level.toLowerCase()] ?? level;
}

export function NotificationCenter() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchNotificationsHttp(false));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    let disposed = false;
    let cleanup: (() => void) | undefined;
    // A sessão atual do Dashboard é HttpOnly e não é uma sessão Supabase.
    // O polling protegido mantém as notificações atualizadas mesmo quando o
    // canal Realtime anônimo é corretamente bloqueado pelas políticas RLS.
    const polling = window.setInterval(() => void refresh(), 15_000);
    void fetchSupabasePublicConfigHttp()
      .then((config) => {
        if (disposed) return;
        const client = getSupabaseBrowserClient(config);
        const channel = client
          .channel("dashboard-notifications")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "notifications" },
            () => void refresh(),
          )
          .subscribe();
        cleanup = () => void client.removeChannel(channel);
      })
      .catch(() => {
        // A central continua funcional por HTTP; Realtime é aprimoramento progressivo.
      });
    return () => {
      disposed = true;
      window.clearInterval(polling);
      cleanup?.();
    };
  }, [refresh]);

  async function mutate(id: string, action: "read" | "archive") {
    setBusyId(id);
    setError(null);
    try {
      await mutateNotificationHttp({ id, action });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function mutateBulk(action: "read_all" | "archive_all") {
    if (action === "archive_all") {
      const ok = window.confirm(
        "Limpar todas as notificações? Elas saem da lista (arquivadas).",
      );
      if (!ok) return;
    }
    setBulkBusy(true);
    setError(null);
    try {
      await mutateNotificationHttp({ action });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBulkBusy(false);
    }
  }

  const unread = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-8 w-8 rounded-none border-border bg-card"
          aria-label={`${unread} notificações não lidas`}
        >
          <Bell className="h-3.5 w-3.5" />
          {unread > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[9px] leading-4 text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(420px,calc(100vw-2rem))] rounded-none p-0"
      >
        <div className="flex items-start justify-between gap-2 border-b border-border p-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider">
              Notificações
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {loading
                ? "Carregando…"
                : `${unread} não lidas · atualização contínua`}
            </p>
          </div>
          {items.length > 0 ? (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 font-mono text-[10px]"
                disabled={bulkBusy || unread === 0}
                title="Marcar tudo como lido"
                onClick={() => void mutateBulk("read_all")}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Ler tudo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 font-mono text-[10px] text-muted-foreground hover:text-rose-400"
                disabled={bulkBusy}
                title="Limpar notificações"
                onClick={() => void mutateBulk("archive_all")}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar
              </Button>
            </div>
          ) : null}
        </div>
        <div className="max-h-[430px] overflow-y-auto">
          {error ? (
            <p className="p-3 font-mono text-[10px] text-rose-400">{error}</p>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <p className="p-6 text-center font-mono text-xs text-muted-foreground">
              Nenhuma notificação.
            </p>
          ) : null}
          {items.map((item) => (
            <article
              key={item.id}
              className={`border-b border-border/60 p-3 ${item.read_at ? "opacity-65" : "bg-primary/5"}`}
            >
              <div className="flex gap-3">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-muted" : "bg-primary"}`}
                />
                <div className="min-w-0 flex-1">
                  {item.href ? (
                    <a
                      href={item.href}
                      className="font-mono text-xs font-semibold hover:text-primary"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <p className="font-mono text-xs font-semibold">
                      {item.title}
                    </p>
                  )}
                  {item.message ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.message}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {severityLabel(item.level) ? (
                      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        {severityLabel(item.level)}
                      </p>
                    ) : null}
                    <p className="font-mono text-[9px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!item.read_at ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={busyId === item.id || bulkBusy}
                      title="Marcar como lida"
                      onClick={() => void mutate(item.id, "read")}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={busyId === item.id || bulkBusy}
                    title="Remover"
                    onClick={() => void mutate(item.id, "archive")}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
          {loading && !items.length ? (
            <p className="p-6 text-center font-mono text-xs text-muted-foreground">
              Carregando notificações…
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
