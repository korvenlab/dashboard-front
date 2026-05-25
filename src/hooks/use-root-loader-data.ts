import { useKorvenDashboard } from "@/lib/dashboard-context";
import type { RootLoaderData } from "@/lib/root-loader-data";

/**
 * Compatível com rotas que liam o loader da raiz; dados vêm do contexto (botão Atualizar).
 */
export function useRootLoaderData(): RootLoaderData {
  const { dashboard } = useKorvenDashboard();
  return { dashboard };
}
