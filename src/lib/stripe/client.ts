import Stripe from "stripe";
import { getStripeServerEnv } from "@/lib/server-env";

let stripeClient: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;

  const { secretKey } = getStripeServerEnv();
  const key = secretKey?.trim();
  if (!key) {
    stripeClient = null;
    return stripeClient;
  }

  stripeClient = new Stripe(key, {
    apiVersion: "2025-08-27.basil",
    typescript: true,
  });
  return stripeClient;
}

export async function paginateStripe<T extends { id: string }>(
  fetchPage: (startingAfter?: string) => Promise<Stripe.ApiList<T>>,
  maxPages = 20,
): Promise<T[]> {
  const items: T[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const list = await fetchPage(startingAfter);
    items.push(...list.data);
    if (!list.has_more || list.data.length === 0) break;
    startingAfter = list.data[list.data.length - 1]?.id;
  }
  return items;
}
