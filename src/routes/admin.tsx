import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  deleteAdminUser,
  fetchAdminUserAssets,
  fetchAdminRoles,
  fetchAdminUsers,
  patchAdminUserRole,
  patchAdminUserStatus,
  patchWagooUserComplimentaryAccess,
  type AdminRoleOption,
  type AdminRolesResult,
  type AdminSource,
  type AdminUser,
  type AdminUserAsset,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const WAGOO_COMPLIMENTARY_PRESETS = [
  { value: "none", label: "Sem cortesia (revogar)" },
  { value: "7", label: "+7 dias" },
  { value: "30", label: "+30 dias" },
  { value: "60", label: "+60 dias" },
  { value: "90", label: "+90 dias" },
  { value: "180", label: "+180 dias" },
  { value: "365", label: "+365 dias" },
] as const;

function complimentaryIsActive(until: string | null | undefined): boolean {
  if (!until || typeof until !== "string") return false;
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function formatComplimentaryRemaining(until: string | null | undefined): string {
  if (!complimentaryIsActive(until)) return "—";
  const ms = new Date(until!).getTime() - Date.now();
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}min`;
  return `${Math.max(0, m)} min`;
}

function stringifyUnknown(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    try {
      return JSON.stringify(e);
    } catch {
      return "erro desconhecido";
    }
  }
  return String(e);
}

function AdminPage() {
  const [source, setSource] = useState<AdminSource>("wagoo");
  const [pageSource, setPageSource] = useState<AdminSource>("wagoo");
  const [search, setSearch] = useState("");
  const [pageData, setPageData] = useState<{ items: AdminUser[]; page: number; limit: number; total: number }>({
    items: [],
    page: 1,
    limit: 20,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [assets, setAssets] = useState<AdminUserAsset[] | null>(null);
  const [roles, setRoles] = useState<AdminRoleOption[]>([]);
  const [rolesFromFallback, setRolesFromFallback] = useState(false);
  const [rolesFallbackReason, setRolesFallbackReason] = useState<string>("");
  const [roleDraftByUser, setRoleDraftByUser] = useState<Record<string, string>>({});
  const [busyActionByUser, setBusyActionByUser] = useState<Record<string, string>>({});
  const [complimentaryDraftByUser, setComplimentaryDraftByUser] = useState<Record<string, string>>({});

  function setUserBusy(userId: string, label: string) {
    setBusyActionByUser((prev) => ({ ...prev, [userId]: label }));
  }

  function clearUserBusy(userId: string) {
    setBusyActionByUser((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }

  async function load(page = 1, sourceOverride?: AdminSource) {
    const targetSource = sourceOverride ?? source;
    setLoading(true);
    setMessage("");
    try {
      const data = (await fetchAdminUsers({
        data: { source: targetSource, search: search.trim() || undefined, page, limit: 20 },
      })) as { items: AdminUser[]; page: number; limit: number; total: number };
      setPageData(data);
      setPageSource(targetSource);
      setComplimentaryDraftByUser({});
      setAssets(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setPageData({ items: [], page: 1, limit: 20, total: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(user: AdminUser) {
    const actionSource = pageSource;
    setUserBusy(user.id, "status");
    setMessage("");
    try {
      await patchAdminUserStatus({
        data: { source: actionSource, id: user.id, active: !user.active },
      });
      await load(pageData.page, actionSource);
      setMessage(`Status atualizado para ${user.email ?? user.id}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      clearUserBusy(user.id);
    }
  }

  async function makeAdmin(user: AdminUser) {
    const actionSource = pageSource;
    const nextRole = roleDraftByUser[user.id] ?? user.role;
    setUserBusy(user.id, "role");
    setMessage("");
    try {
      await patchAdminUserRole({
        data: { source: actionSource, id: user.id, role: nextRole },
      });
      await load(pageData.page, actionSource);
      setMessage(`Role atualizada para ${user.email ?? user.id}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      clearUserBusy(user.id);
    }
  }

  async function applyWagooComplimentary(user: AdminUser) {
    const preset = complimentaryDraftByUser[user.id]?.trim();
    if (!preset) {
      setMessage("Escolha uma opção em «Ajustar cortesia» antes de aplicar.");
      return;
    }
    setUserBusy(user.id, "complimentary");
    setMessage("");
    try {
      await patchWagooUserComplimentaryAccess({
        data: {
          source: "wagoo",
          id: user.id,
          preset: preset as "none" | "7" | "30" | "60" | "90" | "180" | "365",
        },
      });
      await load(pageData.page, "wagoo");
      setMessage(`Cortesia atualizada: ${user.email ?? user.id}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      clearUserBusy(user.id);
    }
  }

  async function permanentlyDeleteAccount(user: AdminUser) {
    const actionSource = pageSource;
    const ok = confirm(
      `Apagar a conta ${user.email ?? user.id} permanentemente do banco e da autenticação? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;
    setUserBusy(user.id, "delete");
    setMessage("");
    try {
      await deleteAdminUser({ data: { source: actionSource, id: user.id } });
      await load(pageData.page, actionSource);
      setMessage(`Conta ${user.email ?? user.id} removida permanentemente.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      clearUserBusy(user.id);
    }
  }

  async function viewAssets(user: AdminUser) {
    const actionSource = pageSource;
    setUserBusy(user.id, "assets");
    setMessage("");
    try {
      const items = (await fetchAdminUserAssets({
        data: { source: actionSource, id: user.id },
      })) as AdminUserAsset[];
      setAssets(items);
      setMessage(items.length ? "" : "Sem assets para este usuário.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setAssets([]);
    } finally {
      clearUserBusy(user.id);
    }
  }

  const totalPages = Math.max(1, Math.ceil((pageData.total || 0) / pageData.limit));
  const roleLabelBySlug = new Map(roles.map((r) => [r.value, r.label]));
  const rolePermissionsBySlug = new Map(roles.map((r) => [r.value, r.permissions ?? []]));

  useEffect(() => {
    let cancelled = false;
    setPageData({ items: [], page: 1, limit: 20, total: 0 });
    setAssets(null);
    void load(1, source);
    if (source === "2avendas") {
      void (async () => {
        try {
          const result = (await fetchAdminRoles({ data: { source } })) as AdminRolesResult;
          if (cancelled) return;
          setRoles(result.items);
          setRolesFromFallback(result.fromFallback);
          const fr = result.fallbackReason;
          setRolesFallbackReason(
            typeof fr === "string" ? fr : fr != null ? JSON.stringify(fr) : "",
          );
        } catch (e) {
          if (cancelled) return;
          setRoles([]);
          setRolesFromFallback(false);
          setRolesFallbackReason("");
          setMessage(e instanceof Error ? e.message : stringifyUnknown(e));
        }
      })();
    } else {
      setRoles([]);
      setRolesFromFallback(false);
      setRolesFallbackReason("");
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const u of pageData.items) next[u.id] = u.role;
    setRoleDraftByUser(next);
  }, [pageData.items]);

  const sourceSwitching = source !== pageSource;
  const wagooTableColSpan = 11;
  const avendasTableColSpan = 6;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em]">Admin Console</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          Gerenciamento de usuários por app (Wagoo e 2AVendas), usando APIs admin server-side.
        </p>
        <p className="mt-2 max-w-3xl font-mono text-[11px] leading-relaxed text-muted-foreground">
          Nas duas origens o contrato é o mesmo: desativar só corta o acesso (sem marcar exclusão lógica);
          apagar conta remove o usuário em Supabase Auth e o que o banco apagar em cascata (wag-backend e 2A-back).
        </p>
      </div>

      <section className="rounded border border-border bg-card/40 p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">App</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`rounded border px-3 py-1 font-mono text-xs ${
              source === "wagoo" ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground"
            }`}
            onClick={() => setSource("wagoo")}
          >
            Wagoo
          </button>
          <button
            className={`rounded border px-3 py-1 font-mono text-xs ${
              source === "2avendas" ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground"
            }`}
            onClick={() => setSource("2avendas")}
          >
            2AVendas
          </button>
        </div>
        {source === "wagoo" ? (
          <div className="mt-3 max-w-3xl rounded border border-primary/35 bg-primary/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/90">
            <span className="font-semibold uppercase tracking-wider text-primary">Wagoo — acesso</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">Stripe</code> mostra{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">has_paid</code> (só leitura; webhook Stripe).
            <code className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px]">Acesso</code> é o que a Wagoo usa na
            prática. A coluna <span className="text-foreground">Origem do acesso</span> resume se vem de{" "}
            <code className="text-[10px]">has_paid</code> (Stripe ou SQL), de cortesia por{" "}
            <code className="text-[10px]">link</code> ou de cortesia só na base / painel — passe o rato para ver o
            texto completo.
          </div>
        ) : null}
      </section>

      <section className="flex flex-wrap items-end gap-2 rounded border border-border bg-card/40 p-3">
        <div className="flex min-w-[260px] flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Buscar por email</label>
          <input
            className="h-8 rounded border border-border bg-card px-2 font-mono text-xs"
            placeholder="ex: user@dominio.com"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="h-8 rounded border border-border bg-card px-3 font-mono text-xs"
          onClick={() => load(1)}
          disabled={loading}
        >
          {loading ? "Carregando..." : "Buscar"}
        </button>
      </section>

      {message ? (
        <div className="rounded border border-chart-2/60 bg-chart-2/10 px-3 py-2 font-mono text-xs text-chart-2">
          {message}
        </div>
      ) : null}
      {source === "2avendas" && pageSource === "2avendas" && rolesFromFallback ? (
        <div className="rounded border border-chart-4/60 bg-chart-4/10 px-3 py-2 font-mono text-xs text-chart-4">
          {source}: fallback de roles ativo. Motivo:{" "}
          {rolesFallbackReason.trim() || "backend não expôs /api/admin/roles"}.
        </div>
      ) : null}

      <section className="overflow-x-auto rounded border border-border">
        <table
          className={`w-full border-collapse ${pageSource === "wagoo" ? "min-w-[1180px]" : "min-w-[900px]"}`}
        >
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Email</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Nome</th>
              {pageSource === "wagoo" ? (
                <>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Stripe</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Acesso</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Cortesia até</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                    Origem do acesso
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Tempo restante</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Ajustar cortesia</th>
                </>
              ) : (
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Role</th>
              )}
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Status</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Criado</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.map((u) => (
              <tr key={u.id} className="border-b border-border/50">
                <td className="px-3 py-2 font-mono text-xs">{u.email ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{u.name ?? "—"}</td>
                {pageSource === "wagoo" ? (
                  <>
                    <td className="px-3 py-2 font-mono text-xs">
                      {typeof u.hasPaid === "boolean" ? (
                        u.hasPaid ? (
                          <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                            pago
                          </span>
                        ) : (
                          <span className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                            não pago
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {typeof u.hasAccess === "boolean" ? (
                        u.hasAccess ? (
                          <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                            sim
                          </span>
                        ) : (
                          <span className="rounded border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 text-rose-300">
                            não
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-[140px] px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {complimentaryIsActive(u.complimentary_access_until) && u.complimentary_access_until
                        ? new Date(u.complimentary_access_until).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                    <td className="max-w-[220px] px-3 py-2 align-top">
                      <span
                        className="block cursor-help font-mono text-[10px] leading-snug text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2"
                        title={u.accessOriginDetail ?? ""}
                      >
                        {u.accessOriginSummary ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {formatComplimentaryRemaining(u.complimentary_access_until)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <select
                          className="h-7 max-w-[200px] rounded border border-border bg-card px-2 font-mono text-[10px]"
                          value={complimentaryDraftByUser[u.id] ?? ""}
                          disabled={Boolean(busyActionByUser[u.id]) || sourceSwitching}
                          onChange={(e) =>
                            setComplimentaryDraftByUser((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">— escolher —</option>
                          {WAGOO_COMPLIMENTARY_PRESETS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="h-7 max-w-[200px] rounded border border-primary/50 px-2 font-mono text-[10px] text-primary hover:bg-primary/10"
                          onClick={() => void applyWagooComplimentary(u)}
                          disabled={Boolean(busyActionByUser[u.id]) || sourceSwitching}
                        >
                          {busyActionByUser[u.id] === "complimentary" ? "aplicando…" : "Aplicar cortesia"}
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <td className="px-3 py-2 font-mono text-xs">
                    <span className="rounded border border-border/70 bg-card px-2 py-0.5">
                      {roleLabelBySlug.get(u.role) ?? `Sem catálogo (${u.role})`}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2 font-mono text-xs">
                  {u.active ? (
                    <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                      ativo
                    </span>
                  ) : (
                    <span className="rounded border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 text-rose-300">
                      inativo
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{u.createdAt ? u.createdAt.slice(0, 10) : "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {busyActionByUser[u.id] ? (
                      <span className="inline-flex items-center rounded border border-primary/50 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                        processando...
                      </span>
                    ) : sourceSwitching ? (
                      <span className="inline-flex items-center rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        trocando origem...
                      </span>
                    ) : null}
                    {pageSource === "2avendas" ? (
                      <>
                        <select
                          className="h-7 rounded border border-border bg-card px-2 font-mono text-[10px]"
                          value={roleDraftByUser[u.id] ?? u.role}
                          title={(rolePermissionsBySlug.get(roleDraftByUser[u.id] ?? u.role) ?? []).join(", ")}
                          disabled={Boolean(busyActionByUser[u.id]) || sourceSwitching}
                          onChange={(e) =>
                            setRoleDraftByUser((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                        >
                          {(roles.length
                            ? roles
                            : [{ value: u.role, label: u.role }]
                          ).map((r) => (
                            <option
                              key={r.value}
                              value={r.value}
                              title={[r.description ?? "", ...(r.permissions ?? [])].filter(Boolean).join(" | ")}
                            >
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="rounded border border-border px-2 py-1 font-mono text-[10px] hover:bg-card"
                          onClick={() => makeAdmin(u)}
                          disabled={Boolean(busyActionByUser[u.id]) || sourceSwitching}
                        >
                          {busyActionByUser[u.id] === "role" ? "salvando..." : "salvar role"}
                        </button>
                      </>
                    ) : null}
                    <button
                      className="rounded border border-border px-2 py-1 font-mono text-[10px] hover:bg-card"
                      onClick={() => toggleActive(u)}
                      disabled={Boolean(busyActionByUser[u.id]) || sourceSwitching}
                    >
                      {busyActionByUser[u.id] === "status"
                        ? "salvando..."
                        : u.active
                          ? "desativar"
                          : "ativar"}
                    </button>
                    <button
                      className="rounded border border-border px-2 py-1 font-mono text-[10px] hover:bg-card"
                      onClick={() => viewAssets(u)}
                      disabled={Boolean(busyActionByUser[u.id]) || sourceSwitching}
                    >
                      {busyActionByUser[u.id] === "assets" ? "carregando..." : "assets"}
                    </button>
                    <button
                      className="rounded border border-chart-3/60 px-2 py-1 font-mono text-[10px] text-chart-3 hover:bg-chart-3/10"
                      onClick={() => permanentlyDeleteAccount(u)}
                      disabled={Boolean(busyActionByUser[u.id]) || sourceSwitching}
                    >
                      {busyActionByUser[u.id] === "delete" ? "apagando..." : "apagar conta"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!pageData.items.length ? (
              <tr>
                <td
                  colSpan={pageSource === "wagoo" ? wagooTableColSpan : avendasTableColSpan}
                  className="px-3 py-6 text-center font-mono text-xs text-muted-foreground"
                >
                  Sem usuários para o filtro atual.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="flex items-center justify-between">
        <div className="font-mono text-xs text-muted-foreground">
          Página {pageData.page} / {totalPages} — total {pageData.total}
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-1 font-mono text-xs"
            disabled={pageData.page <= 1 || loading}
            onClick={() => load(pageData.page - 1)}
          >
            anterior
          </button>
          <button
            className="rounded border px-3 py-1 font-mono text-xs"
            disabled={pageData.page >= totalPages || loading}
            onClick={() => load(pageData.page + 1)}
          >
            próxima
          </button>
        </div>
      </section>

      {assets ? (
        <section className="rounded border border-border p-3">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wider">Assets do usuário</h2>
          {!assets.length ? (
            <p className="font-mono text-xs text-muted-foreground">Nenhum asset encontrado.</p>
          ) : (
            <ul className="space-y-2">
              {assets.map((a) => (
                <li key={a.id} className="rounded border border-border/60 p-2 font-mono text-xs">
                  <div>ID: {a.id}</div>
                  <div>Nome: {a.name ?? "—"}</div>
                  <div>Bucket: {a.bucket ?? "—"}</div>
                  <div>Path: {a.path ?? "—"}</div>
                  <div>URL: {a.url ?? "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
