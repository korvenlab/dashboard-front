import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearch } from "@tanstack/react-router";
import { fetchKorvenDashboard } from "@/lib/dashboard-api";
import type { DashboardViewModel } from "@/lib/dashboard-view";
import type { RootSearch } from "@/lib/root-search";

type KorvenDashboardContextValue = {
  dashboard: DashboardViewModel | null;
  loading: boolean;
  error: string | null;
  loadedOnce: boolean;
  /** Busca Wagoo + 2AVendas via dashboard-back (só chamar no botão Atualizar). */
  refresh: () => Promise<void>;
};

const KorvenDashboardContext = createContext<KorvenDashboardContextValue | null>(null);

function filtersKey(search: RootSearch): string {
  return [
    search.organization_id ?? "",
    search.period_days ?? 30,
    search.chart_days ?? 14,
  ].join("|");
}

export function KorvenDashboardProvider({ children }: { children: ReactNode }) {
  const search = useSearch({ from: "__root__" }) as RootSearch;
  const [dashboard, setDashboard] = useState<DashboardViewModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const key = filtersKey(search);

  useEffect(() => {
    setDashboard(null);
    setLoadedOnce(false);
    setError(null);
  }, [key]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = (await fetchKorvenDashboard({
        data: {
          organization_id: search.organization_id,
          period_days: search.period_days ?? 30,
          chart_days: search.chart_days ?? 14,
          force_refresh: true,
        },
      })) as DashboardViewModel;
      setDashboard(result);
      setLoadedOnce(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [search.organization_id, search.period_days, search.chart_days]);

  const value = useMemo(
    () => ({ dashboard, loading, error, loadedOnce, refresh }),
    [dashboard, loading, error, loadedOnce, refresh],
  );

  return (
    <KorvenDashboardContext.Provider value={value}>{children}</KorvenDashboardContext.Provider>
  );
}

export function useKorvenDashboard(): KorvenDashboardContextValue {
  const ctx = useContext(KorvenDashboardContext);
  if (!ctx) {
    throw new Error("useKorvenDashboard deve ser usado dentro de KorvenDashboardProvider");
  }
  return ctx;
}

export function KorvenDashboardEmptyHint({ className }: { className?: string }) {
  const { loading, error } = useKorvenDashboard();
  return (
    <div
      className={
        className ??
        "mx-auto max-w-lg rounded border border-border bg-card/30 p-8 text-center font-mono text-sm text-muted-foreground"
      }
    >
      <p className="text-foreground">Nenhum dado carregado ainda.</p>
      <p className="mt-2 text-xs leading-relaxed">
        Use o botão <strong className="text-primary">Atualizar</strong> na barra superior para buscar métricas de
        Wagoo e 2AVendas. Alterar organização ou período também exige um novo clique em Atualizar.
      </p>
      {loading ? <p className="mt-4 text-xs text-primary">Carregando…</p> : null}
      {error ? <p className="mt-4 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
