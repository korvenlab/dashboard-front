import type { DashboardViewModel } from "@/lib/dashboard-view";

/** Payload devolvido pelo `loader` da rota raiz (`__root.tsx`). */
export type RootLoaderData = {
  dashboard: DashboardViewModel | null;
};
