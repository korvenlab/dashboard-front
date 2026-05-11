import type { AppEvent, Kpi } from "@/lib/metrics";

export type DashboardSource = "api" | "fallback";

export type DashboardMeta = {
  source: DashboardSource;
  ok?: boolean;
  gerado_em?: string;
  message?: string;
  filtros: {
    organization_id?: string;
    period_days: number;
    chart_days: number;
  };
};

export type ChartPointReceita = { t: string; receita: number };
export type ChartPointVolume = { t: string; volume: number };

export type UiSidebarItem = { label: string; href: string; icon?: string };
export type DashboardTopbarUi = { title?: string; subtitle?: string };

export type DashboardUiConfig = {
  sidebar_itens?: UiSidebarItem[];
  topbar?: DashboardTopbarUi;
};

export type DashboardViewModel = {
  meta: DashboardMeta;
  kpis: Kpi[];
  wagooReceitaPorDia: ChartPointReceita[];
  avendasVolumePorDia: ChartPointVolume[];
  events: AppEvent[];
  ui: DashboardUiConfig;
};

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function record(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Extrai número de um campo que pode ser número ou { valor, delta_pct, ... } */
function metricNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const raw = obj[key];
  const direct = num(raw);
  if (direct !== undefined) return direct;
  const nested = record(raw);
  if (!nested) return undefined;
  return num(nested.valor) ?? num(nested.value) ?? num(nested.total);
}

function metricDelta(obj: Record<string, unknown>, key: string): { pct: number | undefined } {
  const raw = obj[key];
  const nested = record(raw);
  if (!nested) return { pct: undefined };
  const pct = num(nested.delta_pct) ?? num(nested.delta) ?? num(nested.variacao_pct);
  return { pct };
}

function pickMetric(
  obj: Record<string, unknown>,
  keys: string[],
): { value: number | undefined; pct: number | undefined } {
  for (const key of keys) {
    const value = metricNumber(obj, key);
    if (value !== undefined) {
      const { pct } = metricDelta(obj, key);
      return { value, pct };
    }
  }
  return { value: undefined, pct: undefined };
}

function formatDayLabel(isoOrDay: string): string {
  const s = isoOrDay.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(5, 10);
  return s.slice(0, 10);
}

function seriesReceita(raw: unknown): ChartPointReceita[] {
  if (!Array.isArray(raw)) return [];
  const out: ChartPointReceita[] = [];
  for (const row of raw) {
    const o = record(row);
    if (!o) continue;
    const day =
      (typeof o.data === "string" && o.data) ||
      (typeof o.date === "string" && o.date) ||
      (typeof o.dia === "string" && o.dia) ||
      (typeof o.t === "string" && o.t);
    if (!day) continue;
    const receita =
      num(o.receita) ?? num(o.valor) ?? num(o.total) ?? num(o.amount) ?? num(o.value) ?? 0;
    out.push({ t: formatDayLabel(day), receita });
  }
  return out;
}

function seriesVolume(raw: unknown): ChartPointVolume[] {
  if (!Array.isArray(raw)) return [];
  const out: ChartPointVolume[] = [];
  for (const row of raw) {
    const o = record(row);
    if (!o) continue;
    const day =
      (typeof o.data === "string" && o.data) ||
      (typeof o.date === "string" && o.date) ||
      (typeof o.dia === "string" && o.dia) ||
      (typeof o.t === "string" && o.t);
    if (!day) continue;
    const volume =
      num(o.volume) ??
      num(o.vendas) ??
      num(o.quantidade) ??
      num(o.count) ??
      num(o.valor) ??
      0;
    out.push({ t: formatDayLabel(day), volume });
  }
  return out;
}

function parseKpis(raw: unknown): Kpi[] | undefined {
  const obj = record(raw);
  if (!obj) return undefined;

  const cardsConfig: {
    keys: string[];
    label: string;
    formatter: "currency" | "number" | "percent";
  }[] = [
    { keys: ["receita_total"], label: "Receita Atual", formatter: "currency" },
    {
      keys: ["usuarios_ativos_wagoo", "usuarios_ativos", "assinaturas_ativas_wagoo"],
      label: "Usuários Ativos (Wagoo)",
      formatter: "number",
    },
    {
      keys: ["cadastros_clientes_2avendas", "cadastro_clientes_2avendas", "volume_vendas_2avendas"],
      label: "Cadastro de Clientes (2AVendas)",
      formatter: "number",
    },
    { keys: ["uptime_medio"], label: "Uptime Médio", formatter: "percent" },
  ];

  const cards: Kpi[] = [];
  for (const { keys, label, formatter } of cardsConfig) {
    const { value, pct } = pickMetric(obj, keys);
    if (value === undefined) continue;
    const valueStr =
      formatter === "percent" ? formatPercent(value) : formatter === "number" ? formatInt(value) : formatBrl(value);
    const deltaStr = pct !== undefined ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—";
    const trend: Kpi["trend"] = pct === undefined ? "up" : pct >= 0 ? "up" : "down";
    cards.push({ label, value: valueStr, delta: deltaStr, trend });
  }

  return cards.length ? cards : undefined;
}

function parseEvents(raw: unknown): AppEvent[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: AppEvent[] = [];
  let i = 0;
  for (const row of raw) {
    const o = record(row);
    if (!o) continue;
    const id = typeof o.id === "string" ? o.id : String(++i);
    const message =
      (typeof o.message === "string" && o.message) ||
      (typeof o.mensagem === "string" && o.mensagem) ||
      (typeof o.descricao === "string" && o.descricao) ||
      "";
    const ts =
      (typeof o.timestamp === "string" && o.timestamp) ||
      (typeof o.criado_em === "string" && o.criado_em) ||
      (typeof o.tempo === "string" && o.tempo) ||
      "";
    const statusRaw = typeof o.status === "string" ? o.status.toLowerCase() : "online";
    const status =
      statusRaw === "offline" || statusRaw === "degraded" || statusRaw === "online"
        ? statusRaw
        : "online";
    const appRaw =
      (typeof o.app === "string" && o.app) ||
      (typeof o.origem === "string" && o.origem) ||
      (typeof o.fonte === "string" && o.fonte) ||
      "core";
    const appNorm = appRaw.toLowerCase();
    /** Slug interno sempre `wagoo` = produto Wagoo (wag-backend). Campo `waggo` no JSON veio da API 2AVendas. */
    const app: AppEvent["app"] =
      appNorm.includes("waggo") || appNorm.includes("wagoo")
        ? "wagoo"
        : appNorm.includes("2avendas") || appNorm.includes("avendas")
          ? "2avendas"
          : "core";
    out.push({ id, app, status, message, timestamp: ts });
  }
  return out.length ? out : undefined;
}

/** Rota canónica `/wagoo` no Korven Dashboard; APIs legadas (ex.: 2A-back) expunham `waggo`. */
function normalizeKorvenWagooHref(raw: string): string {
  let h = raw.trim();
  if (!h.startsWith("/")) h = `/${h}`;
  return h.replace(/^\/waggo(?=\/|$)/, "/wagoo");
}

function parseUi(raw: unknown): DashboardUiConfig {
  const o = record(raw);
  if (!o) return {};
  const sidebarRaw = o.sidebar_itens ?? o.sidebar_items;
  let sidebar_itens: UiSidebarItem[] | undefined;
  if (Array.isArray(sidebarRaw)) {
    sidebar_itens = [];
    for (const item of sidebarRaw) {
      const r = record(item);
      if (!r) continue;
      const label = typeof r.label === "string" ? r.label : typeof r.title === "string" ? r.title : "";
      const href =
        (typeof r.href === "string" && r.href) ||
        (typeof r.path === "string" && r.path) ||
        (typeof r.url === "string" && r.url) ||
        "";
      const icon = typeof r.icon === "string" ? r.icon : undefined;
      if (label && href) sidebar_itens.push({ label, href: normalizeKorvenWagooHref(href), icon });
    }
    if (!sidebar_itens.length) sidebar_itens = undefined;
  }
  const topbarRaw = record(o.topbar);
  const title = topbarRaw && typeof topbarRaw.title === "string" ? topbarRaw.title : undefined;
  const subtitle =
    topbarRaw && typeof topbarRaw.subtitle === "string" ? topbarRaw.subtitle : undefined;
  const topbar: DashboardTopbarUi | undefined =
    title || subtitle ? { ...(title ? { title } : {}), ...(subtitle ? { subtitle } : {}) } : undefined;
  return { sidebar_itens, topbar };
}

export function formatBrl(n: number): string {
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

export function formatPercent(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

export function buildFallbackDashboardViewModel(
  filtros: DashboardMeta["filtros"],
  message?: string,
): DashboardViewModel {
  return {
    meta: {
      source: "fallback",
      message,
      filtros,
    },
    kpis: [],
    wagooReceitaPorDia: [],
    avendasVolumePorDia: [],
    events: [],
    ui: {},
  };
}

export function mapDashboardApiPayload(
  raw: unknown,
  filtros: DashboardMeta["filtros"],
): DashboardViewModel | null {
  const root = record(raw);
  if (!root) return null;

  const fallback = buildFallbackDashboardViewModel(filtros);

  const kpis = parseKpis(root.kpis) ?? parseKpis(root.KPIs);

  /** Wagoo (wag-backend) usa `wagoo`. 2AVendas (2A-back) às vezes expõe o mesmo bloco como `waggo` — mesmo produto Wagoo, chave diferente. */
  const wagoo =
    record(root.wagoo) ?? record(root.Wagoo) ?? record(root.waggo) ?? record(root.Waggo);
  const dois = record(root.dois_avendas) ?? record(root.doisAvendas) ?? record(root["2avendas"]);

  const wagooReceitaPorDia = seriesReceita(wagoo?.receita_por_dia ?? wagoo?.serie_receita);
  const avendasVolumePorDia = seriesVolume(dois?.volume_por_dia ?? dois?.serie_volume);

  const events =
    parseEvents(root.eventos_recentes) ??
    parseEvents(root.eventos) ??
    parseEvents(root.recent_events);

  const ui = parseUi(root.ui);

  const gerado_em =
    typeof root.gerado_em === "string"
      ? root.gerado_em
      : typeof root.generated_at === "string"
        ? root.generated_at
        : undefined;

  const ok = typeof root.ok === "boolean" ? root.ok : true;

  const hasAnything =
    !!kpis ||
    wagooReceitaPorDia.length > 0 ||
    avendasVolumePorDia.length > 0 ||
    !!events ||
    Object.keys(ui).length > 0 ||
    !!wagoo ||
    !!dois;

  if (!hasAnything) return null;

  return {
    meta: {
      source: "api",
      ok,
      gerado_em,
      filtros,
    },
    kpis: kpis ?? fallback.kpis,
    wagooReceitaPorDia: wagooReceitaPorDia.length ? wagooReceitaPorDia : fallback.wagooReceitaPorDia,
    avendasVolumePorDia: avendasVolumePorDia.length ? avendasVolumePorDia : fallback.avendasVolumePorDia,
    events: events ?? fallback.events,
    ui,
  };
}

function mergeEventsLists(a: AppEvent[] | undefined, b: AppEvent[] | undefined, fb: AppEvent[]): AppEvent[] {
  const map = new Map<string, AppEvent>();
  for (const e of [...(a ?? []), ...(b ?? [])]) {
    map.set(e.id, e);
  }
  const merged = [...map.values()];
  return merged.length ? merged.slice(0, 60) : fb;
}

function mergeUiConfigs(w: DashboardUiConfig | undefined, a: DashboardUiConfig | undefined): DashboardUiConfig {
  const seen = new Set<string>();
  const sidebar_itens: UiSidebarItem[] = [];
  for (const list of [w?.sidebar_itens, a?.sidebar_itens]) {
    if (!list) continue;
    for (const it of list) {
      const href = normalizeKorvenWagooHref(it.href.startsWith("/") ? it.href : `/${it.href}`);
      if (seen.has(href)) continue;
      seen.add(href);
      sidebar_itens.push({ ...it, href });
    }
  }
  const topbar: DashboardTopbarUi = {
    ...(w?.topbar ?? {}),
    ...(a?.topbar ?? {}),
  };
  return {
    sidebar_itens: sidebar_itens.length ? sidebar_itens : undefined,
    topbar: Object.keys(topbar).length ? topbar : undefined,
  };
}

/** Une visões vindas de Wagoo (wag-backend) e 2AVendas (2A-back); cada uma pode ser `null` se falhou ou veio vazia. */
export function mergeDualDashboardViewModels(
  wagoo: DashboardViewModel | null,
  avendas: DashboardViewModel | null,
  filtros: DashboardMeta["filtros"],
  warnings: string[],
): DashboardViewModel {
  const fb = buildFallbackDashboardViewModel(
    filtros,
    warnings.filter(Boolean).join(" · ") || undefined,
  );

  const receita =
    wagoo?.kpis.find((k) => k.label.toLowerCase().includes("receita")) ??
    avendas?.kpis.find((k) => k.label.toLowerCase().includes("receita"));
  const usuariosWagoo = wagoo?.kpis.find(
    (k) =>
      k.label.toLowerCase().includes("wagoo") ||
      k.label.toLowerCase().includes("usuário") ||
      k.label.toLowerCase().includes("assinatura"),
  );
  const cadastroClientes = avendas?.kpis.find(
    (k) =>
      k.label.toLowerCase().includes("2avendas") ||
      k.label.toLowerCase().includes("cadastro") ||
      k.label.toLowerCase().includes("cliente") ||
      k.label.toLowerCase().includes("volume"),
  );
  const uptime =
    wagoo?.kpis.find((k) => k.label.toLowerCase().includes("uptime")) ??
    avendas?.kpis.find((k) => k.label.toLowerCase().includes("uptime"));

  const mergedKpis: Kpi[] = [];
  if (receita) mergedKpis.push(receita);
  if (usuariosWagoo) mergedKpis.push(usuariosWagoo);
  if (cadastroClientes) mergedKpis.push(cadastroClientes);
  if (uptime) mergedKpis.push(uptime);

  const kpisFinal = mergedKpis.length ? mergedKpis : fb.kpis;

  const wagooReceitaPorDia =
    wagoo && wagoo.wagooReceitaPorDia.length > 0
      ? wagoo.wagooReceitaPorDia
      : avendas && avendas.wagooReceitaPorDia.length > 0
        ? avendas.wagooReceitaPorDia
        : fb.wagooReceitaPorDia;

  const avendasVolumePorDia =
    avendas && avendas.avendasVolumePorDia.length > 0
      ? avendas.avendasVolumePorDia
      : fb.avendasVolumePorDia;

  const events = mergeEventsLists(wagoo?.events, avendas?.events, fb.events);
  const ui = mergeUiConfigs(wagoo?.ui, avendas?.ui);

  const source: DashboardSource =
    wagoo?.meta.source === "api" || avendas?.meta.source === "api" ? "api" : "fallback";

  const msgParts = [
    ...warnings,
    wagoo?.meta.message,
    avendas?.meta.message,
  ].filter((x): x is string => typeof x === "string" && x.length > 0);

  return {
    meta: {
      source,
      ok: true,
      gerado_em: avendas?.meta.gerado_em ?? wagoo?.meta.gerado_em,
      filtros,
      message: msgParts.length ? msgParts.join(" · ") : undefined,
    },
    kpis: kpisFinal,
    wagooReceitaPorDia,
    avendasVolumePorDia,
    events,
    ui,
  };
}
