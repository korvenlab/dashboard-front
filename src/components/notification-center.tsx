import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Bell, Check, RefreshCw } from "lucide-react";
import {
  fetchNotifications,
  fetchSupabasePublicConfig,
  mutateNotification,
} from "@/lib/central-api";
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

export function NotificationCenter() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(
        (await fetchNotifications({
          data: { includeArchived: false },
        })) as Notification[],
      );
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
    void fetchSupabasePublicConfig({ data: {} })
      .then((rawConfig) => {
        if (disposed) return;
        const config = rawConfig as { url: string; anonKey: string };
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
      await mutateNotification({ data: { id, action } });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
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
        <div className="flex items-center justify-between border-b border-border p-3">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider">
              Notificações
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {unread} não lidas · atualização contínua
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
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
                  <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!item.read_at ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={busyId === item.id}
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
                    disabled={busyId === item.id}
                    title="Arquivar"
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
