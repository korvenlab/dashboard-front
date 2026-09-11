import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, RefreshCw, Search, X } from "lucide-react";
import {
  createCentralAccessLinkHttp,
  executeCentralAdminCommandHttp,
  fetchUnifiedUserDetailsHttp,
  fetchUnifiedUsersHttp,
  reconcileCentralHttp,
} from "@/lib/central-http";
import type {
  UnifiedUser,
  UnifiedUserDetails,
  UnifiedUsersPage,
} from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type ActionState = { state: "pending" | "success" | "error"; message: string };
type Command =
  "role.set" | "status.set" | "plan.set" | "access.grant" | "user.delete";

const EMPTY_PAGE: UnifiedUsersPage = {
  items: [],
  page: 1,
  limit: 25,
  total: 0,
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function statusTone(status: string | null) {
  const value = status?.toLowerCase();
  if (value === "active" || value === "ativo" || value === "paid")
    return "border-emerald-500/50 text-emerald-300";
  if (value === "past_due" || value === "pending" || value === "pendente")
    return "border-amber-500/50 text-amber-300";
  return "border-border text-muted-foreground";
}

function AdminPage() {
  const [page, setPage] = useState<UnifiedUsersPage>(EMPTY_PAGE);
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UnifiedUserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [actionByUser, setActionByUser] = useState<Record<string, ActionState>>(
    {},
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage = 1) => {
      setLoading(true);
      setError(null);
      try {
        setPage(
          await fetchUnifiedUsersHttp({
            search: search.trim() || undefined,
            product: product || undefined,
            status: status || undefined,
            page: targetPage,
            limit: 25,
          }),
        );
      } catch (cause) {
        setPage(EMPTY_PAGE);
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [product, search, status],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  async function syncProducts() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await reconcileCentralHttp();
      setSyncMessage(
        result.results
          .map(
            (item) =>
              `${item.product}: ${item.upserted}/${item.seen}` +
              (item.errors[0] ? ` · ${item.errors[0]}` : ""),
          )
          .join(" · ") + ` · total ${result.unifiedUsers}`,
      );
      await load(1);
    } catch (cause) {
      setSyncMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!loading && page.total === 0 && !syncing && !syncMessage) {
      void syncProducts();
    }
    // Auto-sync only once when the central store is empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, page.total]);

  async function openDetails(user: UnifiedUser) {
    setDetailsLoading(true);
    setError(null);
    try {
      setSelected(await fetchUnifiedUserDetailsHttp(user.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDetailsLoading(false);
    }
  }

  async function command(
    user: UnifiedUser,
    value: Command,
    productSlug: string,
    params: Record<string, unknown> = {},
  ) {
    if (productSlug !== "wagoo" && productSlug !== "2avendas") {
      setActionByUser((current) => ({
        ...current,
        [user.id]: { state: "error", message: "Produto inválido." },
      }));
      return;
    }
    setActionByUser((current) => ({
      ...current,
      [user.id]: { state: "pending", message: value },
    }));
    try {
      const result = await executeCentralAdminCommandHttp({
        userId: user.id,
        productSlug,
        action: value,
        params,
      });
      setActionByUser((current) => ({
        ...current,
        [user.id]: {
          state: "success",
          message: result.message ?? "Comando concluído.",
        },
      }));
      await load(page.page);
      if (selected?.user.id === user.id) await openDetails(user);
    } catch (cause) {
      setActionByUser((current) => ({
        ...current,
        [user.id]: {
          state: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        },
      }));
    }
  }

  async function accessLink(user: UnifiedUser, productSlug: string) {
    setActionByUser((current) => ({
      ...current,
      [user.id]: { state: "pending", message: "access-link" },
    }));
    try {
      const result = await createCentralAccessLinkHttp({
        userId: user.id,
        productSlug,
      });
      await navigator.clipboard.writeText(result.url);
      setActionByUser((current) => ({
        ...current,
        [user.id]: {
          state: "success",
          message: "Link copiado para a área de transferência.",
        },
      }));
    } catch (cause) {
      setActionByUser((current) => ({
        ...current,
        [user.id]: {
          state: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        },
      }));
    }
  }

  const products = useMemo(
    () => [...new Set(page.items.flatMap((user) => user.products))].sort(),
    [page.items],
  );
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));

  return (
    <div className="space-y-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            Control plane · HTTP
          </p>
          <h1 className="mt-1 font-mono text-xl font-semibold uppercase tracking-[0.2em]">
            Usuários unificados
          </h1>
          <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
            Lista e detalhes vêm de{" "}
            <code className="text-foreground">/api/dashboard/central/*</code>,
            que lê o Postgres central com service role. Comandos e links passam
            pelas Edge Functions <code>admin-command</code> e{" "}
            <code>access-link</code>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-none font-mono text-xs"
            disabled={syncing || loading}
            onClick={() => void syncProducts()}
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
            />
            Sincronizar
          </Button>
          <Button
            variant="outline"
            className="rounded-none font-mono text-xs"
            disabled={loading}
            onClick={() => void load(page.page)}
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </div>
      </header>

      {syncMessage ? (
        <div className="border border-border bg-card/40 p-3 font-mono text-[11px] text-muted-foreground">
          {syncMessage}
        </div>
      ) : null}

      <form
        className="grid gap-3 border border-border bg-card/40 p-4 md:grid-cols-[minmax(240px,1fr)_180px_180px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void load(1);
        }}
      >
        <label className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Buscar
          </span>
          <div className="flex h-9 items-center border border-border bg-background px-2">
            <Search className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="w-full bg-transparent font-mono text-xs outline-none"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="nome ou email"
            />
          </div>
        </label>
        <Filter
          label="Produto"
          value={product}
          onChange={setProduct}
          options={products}
        />
        <Filter
          label="Status"
          value={status}
          onChange={setStatus}
          options={["active", "inactive", "pending", "past_due"]}
        />
        <Button
          type="submit"
          className="mt-auto h-9 rounded-none font-mono text-xs"
          disabled={loading}
        >
          Aplicar filtros
        </Button>
      </form>

      {error ? (
        <div className="border border-rose-500/50 bg-rose-500/10 p-3 font-mono text-xs text-rose-300">
          {error}
        </div>
      ) : null}

      <section className="overflow-x-auto border border-border">
        <table className="w-full min-w-[1050px] border-collapse">
          <thead className="border-b border-border bg-card">
            <tr>
              {[
                "Usuário canônico",
                "Produtos / contas",
                "Último login",
                "Plano",
                "Pagamento",
                "Último sync",
                "Ações",
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
            {page.items.map((user) => {
              const action = actionByUser[user.id];
              const primaryProduct = user.products[0];
              const primaryAccount = user.product_accounts.find(
                (account) => account.product_slug === primaryProduct,
              );
              const accountActive = primaryAccount?.status === "active";
              return (
                <tr
                  key={user.id}
                  className="border-b border-border/60 align-top hover:bg-card/40"
                >
                  <td className="px-3 py-3">
                    <button
                      className="text-left"
                      onClick={() => void openDetails(user)}
                    >
                      <span className="block text-sm font-medium hover:text-primary">
                        {user.name ?? "Sem nome"}
                      </span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {user.email ?? user.id}
                      </span>
                    </button>
                    <Badge
                      variant="outline"
                      className={`mt-2 rounded-none font-mono text-[9px] ${statusTone(user.status)}`}
                    >
                      {user.status ?? "sem status"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.products.length ? (
                        user.products.map((slug) => (
                          <Badge
                            key={slug}
                            variant="secondary"
                            className="rounded-none font-mono text-[9px]"
                          >
                            {slug}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Sem contas
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                      {user.product_accounts.length} conta(s)
                    </p>
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">
                    {formatDate(user.last_login_at)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {user.plan ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      variant="outline"
                      className={`rounded-none font-mono text-[9px] ${statusTone(user.payment_status)}`}
                    >
                      {user.payment_status ?? "—"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">
                    {formatDate(user.last_synced_at)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[330px] flex-wrap gap-1">
                      <ActionButton
                        disabled={
                          !primaryProduct || action?.state === "pending"
                        }
                        onClick={() =>
                          primaryProduct &&
                          void accessLink(user, primaryProduct)
                        }
                      >
                        <ExternalLink className="mr-1 h-3 w-3" />
                        Link
                      </ActionButton>
                      <ActionButton
                        disabled={
                          !primaryProduct || action?.state === "pending"
                        }
                        onClick={() =>
                          primaryProduct &&
                          void command(user, "status.set", primaryProduct, {
                            status: accountActive ? "inactive" : "active",
                          })
                        }
                      >
                        {accountActive ? "Desativar" : "Ativar"}
                      </ActionButton>
                      <ActionButton
                        disabled={action?.state === "pending"}
                        onClick={() => void openDetails(user)}
                      >
                        Detalhes
                      </ActionButton>
                    </div>
                    {action ? (
                      <p
                        className={`mt-2 max-w-[300px] font-mono text-[9px] ${action.state === "error" ? "text-rose-400" : action.state === "success" ? "text-emerald-400" : "text-primary"}`}
                      >
                        {action.state === "pending"
                          ? "Processando…"
                          : action.message}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!loading && page.items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-10 text-center font-mono text-xs text-muted-foreground"
                >
                  Nenhum usuário para os filtros atuais.
                </td>
              </tr>
            ) : null}
            {loading && page.items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-10 text-center font-mono text-xs text-primary"
                >
                  Carregando visão unificada…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <footer className="flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>
          Página {page.page} de {totalPages} · {page.total} usuários
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-none"
            disabled={loading || page.page <= 1}
            onClick={() => void load(page.page - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            disabled={loading || page.page >= totalPages}
            onClick={() => void load(page.page + 1)}
          >
            Próxima
          </Button>
        </div>
      </footer>

      {selected || detailsLoading ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
                  Detalhes centrais
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {selected?.user.name ?? "Carregando…"}
                </h2>
                <p className="font-mono text-xs text-muted-foreground">
                  {selected?.user.email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelected(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {detailsLoading && !selected ? (
              <p className="font-mono text-xs text-primary">
                Carregando detalhes…
              </p>
            ) : null}
            {selected ? (
              <UserDetails
                details={selected}
                onCommand={(value, slug, params) =>
                  command(selected.user, value, slug, params)
                }
              />
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        className="h-9 w-full border border-border bg-background px-2 font-mono text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="inline-flex items-center border border-border px-2 py-1 font-mono text-[9px] uppercase hover:border-primary hover:text-primary disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}

function UserDetails({
  details,
  onCommand,
}: {
  details: UnifiedUserDetails;
  onCommand: (
    command: Command,
    product: string,
    params?: Record<string, unknown>,
  ) => void;
}) {
  const product = details.user.products[0];
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Contas por produto
        </h3>
        <div className="space-y-2">
          {details.user.product_accounts.length ? (
            details.user.product_accounts.map((account) => (
              <div key={account.id} className="border border-border p-3">
                <div className="flex items-center justify-between">
                  <strong className="font-mono text-xs">
                    {account.product_slug ?? account.product_id ?? "Produto"}
                  </strong>
                  <Badge
                    variant="outline"
                    className={`rounded-none ${statusTone(account.status)}`}
                  >
                    {account.status ?? "—"}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground">
                  <span>Plano: {account.plan ?? "—"}</span>
                  <span>Login: {formatDate(account.last_login_at)}</span>
                  <span className="col-span-2">
                    Sync: {formatDate(account.last_synced_at)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <Empty />
          )}
        </div>
      </section>
      <section>
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Comandos
        </h3>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={!product}
            onClick={() => {
              const role = window.prompt("Nova role:");
              if (product && role?.trim())
                onCommand("role.set", product, { role: role.trim() });
            }}
          >
            Alterar role
          </ActionButton>
          <ActionButton
            disabled={!product}
            onClick={() => {
              const plan = window.prompt("Novo plano:");
              if (product && plan?.trim())
                onCommand("plan.set", product, { plan: plan.trim() });
            }}
          >
            Alterar plano
          </ActionButton>
          <ActionButton
            disabled={!product}
            onClick={() => {
              if (
                product &&
                window.confirm(
                  `Excluir definitivamente a conta ${product} deste usuário?`,
                )
              )
                onCommand("user.delete", product);
            }}
          >
            Excluir conta
          </ActionButton>
        </div>
      </section>
      <Timeline
        title="Eventos"
        items={details.activity.map((item) => ({
          id: item.id,
          title: item.event_type ?? "evento",
          detail: item.event_id,
          at: item.occurred_at,
        }))}
      />
      <Timeline
        title="Pagamentos"
        items={details.payments.map((item) => ({
          id: item.id,
          title: `${item.event_type ?? "pagamento"} · ${item.status ?? "—"}`,
          detail:
            item.amount == null
              ? null
              : `${(item.currency ?? "BRL").toUpperCase()} ${(item.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          at: item.created_at,
        }))}
      />
      <Timeline
        title="Auditoria"
        items={details.audit.map((item) => ({
          id: item.id,
          title: item.action ?? "ação",
          detail: item.target_type,
          at: item.created_at,
        }))}
      />
    </div>
  );
}

function Timeline({
  title,
  items,
}: {
  title: string;
  items: {
    id: string;
    title: string;
    detail: string | null;
    at: string | null;
  }[];
}) {
  return (
    <section>
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {items.length ? (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="border-l border-primary/50 py-2 pl-3">
              <p className="text-xs font-medium">{item.title}</p>
              {item.detail ? (
                <p className="text-[11px] text-muted-foreground">
                  {item.detail}
                </p>
              ) : null}
              <time className="font-mono text-[9px] text-muted-foreground">
                {formatDate(item.at)}
              </time>
            </div>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </section>
  );
}

function Empty() {
  return (
    <p className="border border-dashed border-border p-3 font-mono text-[10px] text-muted-foreground">
      Sem registros.
    </p>
  );
}
