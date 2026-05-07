import { getRouteApi } from "@tanstack/react-router";
import type { RootLoaderData } from "@/lib/root-loader-data";

const rootRouteApi = getRouteApi("__root__");

/**
 * O `routeTree.gen.ts` usa `as any` nos filhos, o que apaga a inferência do loader da raiz.
 * Este cast mantém o contrato alinhado com `__root.tsx`.
 */
export function useRootLoaderData(): RootLoaderData {
  return rootRouteApi.useLoaderData() as RootLoaderData;
}
