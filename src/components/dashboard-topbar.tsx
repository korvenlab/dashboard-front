import { Calendar as CalendarIcon, ChevronDown, RefreshCw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { useKorvenDashboard } from "@/lib/dashboard-context";
import type { RootSearch } from "@/lib/root-search";

const PERIODS = [
  { label: "Últimas 24h", days: 1 },
  { label: "Últimos 7 dias", days: 7 },
  { label: "Últimos 30 dias", days: 30 },
  { label: "Trimestre", days: 90 },
];

/** UUIDs de exemplo — substitua pelos IDs reais da sua conta ou carregue da API de organizações. */
const ORGS = [
  { value: "__all__", label: "Todas as organizações" },
  {
    value: "00000000-0000-4000-8000-000000000001",
    label: "Korven Lab (UUID demo)",
  },
  {
    value: "00000000-0000-4000-8000-000000000002",
    label: "Wagoo (UUID demo)",
  },
  {
    value: "00000000-0000-4000-8000-000000000003",
    label: "2AVendas (UUID demo)",
  },
];

export function DashboardTopbar() {
  const search = useSearch({ from: "__root__" }) as RootSearch;
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { dashboard, loading, refresh, loadedOnce, error } = useKorvenDashboard();

  const organization_id = search.organization_id;
  const period_days = search.period_days ?? 30;

  let orgChoices = [...ORGS];
  if (organization_id && !orgChoices.some((o) => o.value === organization_id)) {
    orgChoices = [
      ORGS[0],
      { value: organization_id, label: `Organização ${organization_id.slice(0, 8)}…` },
      ...ORGS.slice(1),
    ];
  }

  const orgSelectValue = organization_id ?? "__all__";

  const periodLabel =
    PERIODS.find((p) => p.days === period_days)?.label ?? `Últimos ${period_days} dias`;

  const remoteTitle = dashboard?.ui.topbar?.title ?? "";
  const remoteSubtitle = dashboard?.ui.topbar?.subtitle ?? "";
  const generatedAt = dashboard?.meta.gerado_em;

  return (
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-3 border-b border-border bg-background/90 px-4 py-2 backdrop-blur">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      <div className="ml-1 hidden h-5 w-px bg-border md:block" />
      <Select
        value={orgSelectValue}
        onValueChange={(v) => {
          router.navigate({
            to: path as "/" | "/wagoo" | "/avendas" | "/admin",
            search: (prev): RootSearch => ({
              ...(prev as RootSearch),
              organization_id: v === "__all__" ? undefined : v,
            }),
            replace: true,
          });
        }}
      >
        <SelectTrigger className="h-8 min-w-[200px] rounded-none border-border bg-card font-mono text-xs uppercase tracking-wider">
          <SelectValue placeholder="Organização" />
        </SelectTrigger>
        <SelectContent className="rounded-none">
          {orgChoices.map((o) => (
            <SelectItem key={o.value} value={o.value} className="font-mono text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-8 gap-2 rounded-none border-border bg-card font-mono text-xs uppercase tracking-wider"
          >
            <CalendarIcon className="h-3.5 w-3.5 text-primary" />
            {periodLabel}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="rounded-none">
          {PERIODS.map((p) => (
            <DropdownMenuItem
              key={p.days}
              onClick={() =>
                router.navigate({
                  to: path as "/" | "/wagoo" | "/avendas" | "/admin",
                  search: (prev): RootSearch => ({
                    ...(prev as RootSearch),
                    period_days: p.days,
                  }),
                  replace: true,
                })
              }
              className="font-mono text-xs uppercase tracking-wider"
            >
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {(remoteTitle || remoteSubtitle) && (
        <div className="hidden min-w-0 flex-1 flex-col md:flex">
          {remoteTitle ? (
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.25em] text-foreground">
              {remoteTitle}
            </span>
          ) : null}
          {remoteSubtitle ? (
            <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {remoteSubtitle}
            </span>
          ) : null}
        </div>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {error ? (
          <span className="max-w-xs truncate text-rose-400 normal-case" title={error}>
            {error}
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-8 gap-1.5 rounded-none border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-primary/20"
          title="Busca métricas na Stripe (Wagoo + 2AVENDAS)"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Carregando…" : "Atualizar"}
        </Button>
        {generatedAt && loadedOnce ? (
          <span className="hidden lg:inline" title="gerado_em (Stripe)">
            stripe {generatedAt}
          </span>
        ) : (
          <span className="hidden md:inline text-muted-foreground/80">sem dados</span>
        )}
      </div>
    </header>
  );
}
