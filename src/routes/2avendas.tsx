import { createFileRoute } from "@tanstack/react-router";
import { TwoAvendasProductPage } from "@/components/two-avendas-product-page";

export const Route = createFileRoute("/2avendas")({
  head: () => ({ meta: [{ title: "2AVendas // Korven Lab" }] }),
  component: TwoAvendasProductPage,
});
