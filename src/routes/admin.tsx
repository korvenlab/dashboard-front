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
  patchWagooUserSubscriptionTier,
  wagooComplimentaryIsActive,
  wagooFormatComplimentaryRemaining,
  type AdminRoleOption,
  type AdminRolesResult,
  type AdminSource,
  type AdminUser,
  type AdminUserAsset,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const WAGOO_TIER_OPTIONS = [
  { value: "basic", label: "Basic — R$ 59 (1 usuário)" },
  { value: "pro", label: "Pro — R$ 149 (até 3 usuários)" },
  { value: "pro_plus", label: "Pro+ — R$ 259 (até 5 usuários)" },
  { value: "none", label: "Revogar plano (sem assinatura)" },
] as const;

const WAGOO_COMPLIMENTARY_PRESETS = [
  { value: "", label: "— não alterar cortesia —" },
  { value: "none", label: "Sem cortesia (revogar)" },
  { value: "7", label: "+7 dias" },
  { value: "30", label: "+30 dias" },
  { value: "60", label: "+60 dias" },
  { value: "90", label: "+90 dias" },
  { value: "180", label: "+180 dias" },
  { value: "365", label: "+365 dias" },
] as const;

function WagooComplimentaryUntilCell({ until }: { until: string | null | undefined }) {
  if (!until) return "—";
  const ms = new Date(String(until)).getTime();
  if (!Number.isFinite(ms)) return "—";
  const label = new Date(ms).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const active = wagooComplimentaryIsActive(until);
  return (
    <span className="flex flex-col gap-0.5">
      <span>{label}</span>
      <span className={active ? "text-emerald-400/90" : "text-rose-400/90"}>
        {active ? "cortesia activa" : "cortesia expirada"}
      </span>
    </span>
  );
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

function WagooPlanStatusChip({
  label,
  active,
  variant,
}: {
  label: string;
  active: boolean;
  variant: "pro" | "addon" | "cortesia";
}) {
  const activeClass =
    variant === "addon"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
      : variant === "cortesia"
        ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
        : "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  const inactiveClass = "border-border bg-muted/30 text-muted-foreground";

  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 font-mono text-[10px] ${active ? activeClass : inactiveClass}`}
    >
      {label}: {active ? "ativo" : "inativo"}
    </span>
  );
}

const TIER_CHIP_LABEL: Record<string, string> = {
  basic: "Basic",
  pro: "Pro",
  pro_plus: "Pro+",
};

type WagooPlanSelectorsProps = {
  subscriptionTierCurrent?: string | null;
  complimentaryActive?: boolean;
  tierValue: string;
  complimentaryValue: string;
  disabled: boolean;
  busy: boolean;
  onTierChange: (value: string) => void;
  onComplimentaryChange: (value: string) => void;
  onApply: () => void;
};

function WagooPlanSelectors({
  subscriptionTierCurrent,
  complimentaryActive,
  tierValue,
  complimentaryValue,
  disabled,
  busy,
  onTierChange,
  onComplimentaryChange,
  onApply,
}: WagooPlanSelectorsProps) {
  const selectClass =
    "h-7 w-full max-w-[240px] rounded border border-border bg-card px-2 font-mono text-[10px]";

  const tierLabel = subscriptionTierCurrent
    ? TIER_CHIP_LABEL[subscriptionTierCurrent] ?? subscriptionTierCurrent
    : "Sem plano";

  return (
    <div className="flex min-w-[220px] flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        <WagooPlanStatusChip
          label={tierLabel}
          active={Boolean(subscriptionTierCurrent)}
          variant="pro"
        />
        {complimentaryActive !== undefined ? (
          <WagooPlanStatusChip label="Cortesia" active={complimentaryActive} variant="cortesia" />
        ) : null}
      </div>
      <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        Alterar plano Wagoo
        <select
          className={selectClass}
          value={tierValue}
          disabled={disabled}
          onChange={(e) => onTierChange(e.target.value)}
        >
          <option value="">— não alterar —</option>
          {WAGOO_TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        Cortesia de acesso
        <select
          className={selectClass}
          value={complimentaryValue}
          disabled={disabled}
          onChange={(e) => onComplimentaryChange(e.target.value)}
        >
          {WAGOO_COMPLIMENTARY_PRESETS.map((p) => (
            <option key={p.value || "keep"} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="h-8 rounded border border-primary bg-primary/15 px-3 font-mono text-[10px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
        disabled={disabled}
        onClick={onApply}
      >
        {busy ? "Salvando…" : "Aplicar alterações"}
      </button>
    </div>
  );
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
  const [tierDraftByUser, setTierDraftByUser] = useState<Record<string, string>>({});
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
      setTierDraftByUser({});
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

  async function applyWagooPlans(user: AdminUser) {
    const tierDraft = tierDraftByUser[user.id]?.trim() ?? "";
    const cortesiaDraft = complimentaryDraftByUser[user.id]?.trim() ?? "";

    if (!tierDraft && !cortesiaDraft) {
      setMessage("Seleccione pelo menos um plano para alterar.");
      return;
    }

    setUserBusy(user.id, "planos");
    setMessage("");
    const changes: string[] = [];

    try {
      if (tierDraft) {
        const wantTier =
          tierDraft === "none"
            ? null
            : (tierDraft as "basic" | "pro" | "pro_plus");
        const current = user.subscriptionTier ?? user.subscription_tier ?? null;
        if (wantTier !== current) {
          await patchWagooUserSubscriptionTier({
            data: { source: "wagoo", id: user.id, subscriptionTier: wantTier },
          });
          changes.push(
            wantTier
              ? `${TIER_CHIP_LABEL[wantTier] ?? wantTier} activo`
              : "plano revogado",
          );
        }
      }

      if (cortesiaDraft) {
        await patchWagooUserComplimentaryAccess({
          data: {
            source: "wagoo",
            id: user.id,
            preset: cortesiaDraft as "none" | "7" | "30" | "60" | "90" | "180" | "365",
          },
        });
        changes.push(`cortesia (${cortesiaDraft === "none" ? "revogada" : `+${cortesiaDraft}d`})`);
      }

      await load(pageData.page, "wagoo");
      if (changes.length) {
        setMessage(`Planos actualizados (${user.email ?? user.id}): ${changes.join(", ")}.`);
      } else {
        setMessage("Nenhuma alteração em relação ao estado actual.");
      }
    } catch (e) {
      setMessage(stringifyUnknown(e));
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
    const nextRole: Record<string, string> = {};
    for (const u of pageData.items) {
      nextRole[u.id] = u.role;
    }
    setRoleDraftByUser(nextRole);
  }, [pageData.items]);

  const sourceSwitching = source !== pageSource;
  const wagooTableColSpan = 12;
  const avendasTableColSpan = 7;

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
            <span className="font-semibold uppercase tracking-wider text-primary">Wagoo — planos</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            Planos: <strong className="text-foreground">Basic</strong> (1 usuário, R$ 59),{" "}
            <strong className="text-foreground">Pro</strong> (até 3, R$ 149),{" "}
            <strong className="text-foreground">Pro+</strong> (até 5, R$ 259). Chips mostram o plano actual; nos
            selects escolha só o que quiser mudar e clique em{" "}
            <span className="text-foreground">Aplicar alterações</span>.
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
          className={`w-full border-collapse ${pageSource === "wagoo" ? "min-w-[1320px]" : "min-w-[900px]"}`}
        >
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Email</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Nome</th>
              {pageSource === "wagoo" ? (
                <>
                  <th className="min-w-[220px] px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                    Planos
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Equipe</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Acesso</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Cortesia até</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">
                    Origem do acesso
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Tempo restante</th>
                </>
              ) : (
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Role</th>
              )}
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Status</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider">Último login</th>
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
                    <td className="px-3 py-2 align-top">
                      <WagooPlanSelectors
                        subscriptionTierCurrent={u.subscriptionTier ?? u.subscription_tier}
                        complimentaryActive={wagooComplimentaryIsActive(u.complimentary_access_until)}
                        tierValue={tierDraftByUser[u.id] ?? ""}
                        complimentaryValue={complimentaryDraftByUser[u.id] ?? ""}
                        disabled={Boolean(busyActionByUser[u.id]) || sourceSwitching}
                        busy={busyActionByUser[u.id] === "planos"}
                        onTierChange={(value) =>
                          setTierDraftByUser((prev) => ({ ...prev, [u.id]: value }))
                        }
                        onComplimentaryChange={(value) =>
                          setComplimentaryDraftByUser((prev) => ({ ...prev, [u.id]: value }))
                        }
                        onApply={() => void applyWagooPlans(u)}
                      />
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs text-muted-foreground">
                      {u.barbeirosCount ?? 0}
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
                      <WagooComplimentaryUntilCell until={u.complimentary_access_until} />
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
                      {wagooFormatComplimentaryRemaining(u.complimentary_access_until)}
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
                <td className="max-w-[140px] px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  {u.lastSignInAt
                    ? new Date(u.lastSignInAt).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
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
