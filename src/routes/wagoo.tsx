import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KpiCard } from "@/components/kpi-card";
import { RevenueAreaChart } from "@/components/metrics-charts";
import { EventsTable } from "@/components/events-table";
import {
  KorvenDashboardEmptyHint,
  useKorvenDashboard,
} from "@/lib/dashboard-context";
import {
  createWagooPromoLinkHttp,
  deleteWagooPromoLinkHttp,
  fetchWagooPromoLinksHttp,
  patchWagooPromoLinkActiveHttp,
  type WagooPromoLink,
} from "@/lib/admin-http";
import {
  fetchRecentPaymentsHttp,
  type CentralPaymentHttpRow,
} from "@/lib/central-http";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/wagoo")({
  head: () => ({ meta: [{ title: "Wagoo // Korven Lab" }] }),
  component: WagooPage,
});

const PROMO_DURATION_PRESETS = [
  { value: "7", label: "7 dias (1 semana)" },
  { value: "14", label: "14 dias (2 semanas)" },
  { value: "30", label: "30 dias (~1 mês)" },
  { value: "45", label: "45 dias (~1,5 mês)" },
  { value: "60", label: "60 dias (~2 meses)" },
  { value: "90", label: "90 dias (~3 meses)" },
  { value: "120", label: "120 dias (~4 meses)" },
  { value: "180", label: "180 dias (~6 meses)" },
  { value: "365", label: "365 dias (1 ano)" },
  { value: "custom", label: "Outro valor…" },
] as const;

function WagooPromoLinksPanel() {
  const [items, setItems] = useState<WagooPromoLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("");
  const [durationPreset, setDurationPreset] = useState<string>("60");
  const [customDays, setCustomDays] = useState(60);
  const [maxUses, setMaxUses] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resolvedComplimentaryDays(): number {
    if (durationPreset === "custom") {
      return Math.min(730, Math.max(1, Math.round(customDays) || 1));
    }
    return Math.min(730, Math.max(1, Number(durationPreset) || 60));
  }

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const list = await fetchWagooPromoLinksHttp();
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setItems([]);
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createLink() {
    setMessage("");
    try {
      const maxRaw = maxUses.trim();
      await createWagooPromoLinkHttp({
        label: label.trim() || undefined,
        complimentary_days: resolvedComplimentaryDays(),
        ...(maxRaw !== ""
          ? { max_redemptions: Math.max(1, Number(maxRaw) || 1) }
          : {}),
      });
      setLabel("");
      setMaxUses("");
      await load();
      setMessage("Link criado. Copie a URL abaixo.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function setActive(id: string, is_active: boolean) {
    setMessage("");
    try {
      await patchWagooPromoLinkActiveHttp({
        id,
        is_active,
      });
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeLink(row: WagooPromoLink) {
    if (
      !window.confirm(
        `Apagar permanentemente o link "${row.code}"? O histórico de resgates deste código é removido; quem já resgatou mantém a cortesia até a data.`,
      )
    ) {
      return;
    }
    setMessage("");
    setDeletingId(row.id);
    try {
      await deleteWagooPromoLinkHttp({ id: row.id });
      await load();
      setMessage("Link removido.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded border border-border/80 bg-card/40 p-4 font-mono text-xs">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground">
            Links de cortesia (cadastro)
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground max-w-2xl leading-relaxed">
            Cada link aponta para o login Wagoo com{" "}
            <code className="text-[10px]">?wagoo_promo=código</code>. Após o
            Google, o usuário recebe o tempo de acesso gratuito que você
            escolher abaixo (sem Stripe), enquanto o código estiver válido.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Tempo de acesso gratuito (por cadastro)
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={durationPreset} onValueChange={setDurationPreset}>
              <SelectTrigger className="h-10 w-full max-w-md font-mono text-[11px] sm:w-[min(100%,22rem)]">
                <SelectValue placeholder="Escolha a duração" />
              </SelectTrigger>
              <SelectContent>
                {PROMO_DURATION_PRESETS.map((p) => (
                  <SelectItem
                    key={p.value}
                    value={p.value}
                    className="font-mono text-[11px]"
                  >
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {durationPreset === "custom" ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={730}
                  value={customDays}
                  onChange={(e) => setCustomDays(Number(e.target.value))}
                  className="h-10 w-28 font-mono text-[11px]"
                  aria-label="Dias personalizados"
                />
                <span className="text-[10px] text-muted-foreground">
                  dias (1–730)
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                Serão concedidos{" "}
                <span className="font-medium text-foreground">
                  {resolvedComplimentaryDays()}
                </span>{" "}
                dias por resgate.
              </span>
            )}
          </div>
          {durationPreset === "custom" ? (
            <p className="text-[10px] text-muted-foreground">
              Valor aplicado:{" "}
              <span className="font-medium text-foreground">
                {resolvedComplimentaryDays()}
              </span>{" "}
              dias por resgate.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase text-muted-foreground">
              Rótulo (opcional)
            </Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Campanha parceiro X"
              className="h-9 font-mono text-[11px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase text-muted-foreground">
              Máx. usos (vazio = ∞)
            </Label>
            <Input
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="100"
              className="h-9 font-mono text-[11px]"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              className="h-9 w-full font-mono text-[10px]"
              onClick={() => void createLink()}
            >
              Gerar novo link
            </Button>
          </div>
        </div>
      </div>

      {message ? (
        <p
          className={`mt-3 text-[11px] ${
            message.includes("criado") || message.includes("removido")
              ? "text-emerald-600"
              : "text-destructive"
          }`}
        >
          {message}
        </p>
      ) : null}

      <div className="mt-4 max-h-64 overflow-auto rounded border border-border/60">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-muted/80">
            <tr>
              <th className="p-2 font-medium">Código</th>
              <th className="p-2 font-medium">Acesso (dias)</th>
              <th className="p-2 font-medium">Usos</th>
              <th className="p-2 font-medium">Ativo</th>
              <th className="p-2 font-medium">URL</th>
              <th className="p-2 font-medium">Apagar</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t border-border/50">
                <td className="p-2 align-top">{row.code}</td>
                <td className="p-2 align-top">{row.complimentary_days}</td>
                <td className="p-2 align-top">
                  {row.redemption_count}
                  {row.max_redemptions != null
                    ? ` / ${row.max_redemptions}`
                    : ""}
                </td>
                <td className="p-2 align-top">
                  {row.is_active ? "sim" : "não"}
                </td>
                <td className="p-2 align-top break-all">
                  {row.signup_url ? (
                    <span className="block max-w-[220px]">
                      {row.signup_url}
                    </span>
                  ) : (
                    "—"
                  )}
                  {row.signup_url ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 px-2 text-[10px]"
                      onClick={() =>
                        void navigator.clipboard.writeText(row.signup_url!)
                      }
                    >
                      Copiar
                    </Button>
                  ) : null}
                  <div className="mt-1">
                    {row.is_active ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => void setActive(row.id, false)}
                      >
                        Desativar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => void setActive(row.id, true)}
                      >
                        Reativar
                      </Button>
                    )}
                  </div>
                </td>
                <td className="p-2 align-top">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    disabled={deletingId === row.id}
                    onClick={() => void removeLink(row)}
                  >
                    {deletingId === row.id ? "…" : "Apagar"}
                  </Button>
                </td>
              </tr>
            ))}
            {!items.length && !loading ? (
              <tr>
                <td colSpan={6} className="p-3 text-muted-foreground">
                  Nenhum link (ou erro ao carregar — verifique a configuração do
                  servidor).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function providerLabel(provider: CentralPaymentHttpRow["provider"]) {
  if (provider === "mercadopago") return "Mercado Pago";
  if (provider === "stripe") return "Stripe";
  return "—";
}

function formatMoney(cents: number | null, currency: string | null) {
  if (cents == null) return "—";
  const code = (currency || "BRL").toUpperCase();
  try {
    return (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: code,
    });
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

function WagooPaymentsPanel() {
  const [items, setItems] = useState<CentralPaymentHttpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      setItems(await fetchRecentPaymentsHttp({ product: "wagoo", limit: 40 }));
    } catch (e) {
      setItems([]);
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="rounded border border-border/80 bg-card/40 p-4 font-mono text-xs">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground">
            Pagamentos · ingest Supabase
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
            Stripe (planos Wagoo) e Mercado Pago (sinais/clube) via Edge ingest.
            Também geram notificações no sino do topo.
          </p>
        </div>
      </div>

      {message ? (
        <p className="mt-3 text-[11px] text-destructive">{message}</p>
      ) : null}

      <div className="mt-4 max-h-72 overflow-auto rounded border border-border/60">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-muted/80">
            <tr>
              <th className="p-2 font-medium">Quando</th>
              <th className="p-2 font-medium">Provedor</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium">Valor</th>
              <th className="p-2 font-medium">Tipo</th>
              <th className="p-2 font-medium">ID</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t border-border/50">
                <td className="p-2 align-top whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="p-2 align-top">{providerLabel(row.provider)}</td>
                <td className="p-2 align-top">
                  {row.status ?? row.event_type ?? "—"}
                </td>
                <td className="p-2 align-top">
                  {formatMoney(row.amount_cents, row.currency)}
                </td>
                <td className="p-2 align-top">
                  {row.kind || row.plan || "—"}
                </td>
                <td className="p-2 align-top break-all max-w-[180px]">
                  {row.object_id ?? "—"}
                </td>
              </tr>
            ))}
            {!items.length && !loading ? (
              <tr>
                <td colSpan={6} className="p-3 text-muted-foreground">
                  Nenhum pagamento no central ainda (Stripe legado ou Mercado
                  Pago após o primeiro webhook).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WagooPage() {
  const { dashboard } = useKorvenDashboard();

  if (!dashboard) {
    return (
      <div className="p-6">
        <KorvenDashboardEmptyHint />
      </div>
    );
  }

  const chartDays = dashboard.meta.filtros.chart_days;
  const events = dashboard.events.filter(
    (e) => e.app === "wagoo" || e.app === "core",
  );
  const primary =
    dashboard.kpis.find((k) => k.label.toLowerCase().includes("wagoo")) ??
    dashboard.kpis[1];
  const receita =
    dashboard.kpis.find((k) => k.label.toLowerCase().includes("receita")) ??
    dashboard.kpis[0];
  const uptime =
    dashboard.kpis.find((k) => k.label.toLowerCase().includes("uptime")) ??
    dashboard.kpis[3];
  const kpis = [primary, receita, uptime].filter(Boolean);
  const hasData =
    kpis.length > 0 ||
    dashboard.wagooReceitaPorDia.length > 0 ||
    events.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em]">
          Wagoo
        </h1>
        <p className="mt-1 max-w-3xl font-mono text-xs leading-relaxed text-muted-foreground">
          KPIs, receita, eventos e pagamentos (Stripe SaaS + Mercado Pago
          sinais/clube). Notificações no sino.
        </p>
      </div>

      <WagooPromoLinksPanel />
      <WagooPaymentsPanel />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>
      {!hasData ? (
        <div className="rounded border border-dashed border-border/70 bg-card/30 p-4 font-mono text-xs text-muted-foreground">
          Sem dados de Wagoo para o período/filtro atual.
        </div>
      ) : null}
      <RevenueAreaChart
        data={dashboard.wagooReceitaPorDia}
        chartDays={chartDays}
      />
      <EventsTable events={events.length ? events : dashboard.events} />
    </div>
  );
}
