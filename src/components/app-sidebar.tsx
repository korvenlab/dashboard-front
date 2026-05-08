import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  ShieldUser,
  Activity,
  MessageSquare,
  SquareKanban,
  Wrench,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { UiSidebarItem } from "@/lib/dashboard-view";
import type { RootSearch } from "@/lib/root-search";

type DashboardHref = "/" | "/wagoo" | "/avendas" | "/admin" | "/tasks" | "/monitoramento" | "/mensagens";

function isDashboardHref(url: string): url is DashboardHref {
  return (
    url === "/" ||
    url === "/wagoo" ||
    url === "/avendas" ||
    url === "/admin" ||
    url === "/tasks" ||
    url === "/monitoramento" ||
    url === "/mensagens"
  );
}

const defaultItems: { title: string; url: string; icon: LucideIcon }[] = [
  { title: "Visão Geral", url: "/", icon: LayoutDashboard },
  { title: "Wagoo", url: "/wagoo", icon: Boxes },
  { title: "2AVendas", url: "/avendas", icon: ShoppingCart },
  { title: "Admin", url: "/admin", icon: ShieldUser },
  { title: "Tasks", url: "/tasks", icon: SquareKanban },
  { title: "Monitoramento", url: "/monitoramento", icon: Activity },
  { title: "Mensagens", url: "/mensagens", icon: MessageSquare },
];

function iconFromHint(hint?: string): LucideIcon {
  const h = (hint ?? "").toLowerCase();
  if (h.includes("wagoo") || h.includes("box")) return Boxes;
  if (h.includes("message") || h.includes("mensagem") || h.includes("feedback")) return MessageSquare;
  if (h.includes("vend") || h.includes("cart") || h.includes("shop")) return ShoppingCart;
  if (h.includes("setting") || h.includes("config")) return Wrench;
  if (h.includes("dash") || h.includes("home")) return LayoutDashboard;
  return LayoutDashboard;
}

function mapDynamic(items: UiSidebarItem[]): { title: string; url: string; icon: LucideIcon }[] {
  const mapped = items.map((it) => ({
    title: it.label,
    url: it.href.startsWith("/") ? it.href : `/${it.href}`,
    icon: iconFromHint(it.icon),
  }));
  if (!mapped.some((it) => it.url === "/admin")) {
    mapped.push({ title: "Admin", url: "/admin", icon: ShieldUser });
  }
  if (!mapped.some((it) => it.url === "/monitoramento")) {
    mapped.push({ title: "Monitoramento", url: "/monitoramento", icon: Activity });
  }
  if (!mapped.some((it) => it.url === "/mensagens")) {
    mapped.push({ title: "Mensagens", url: "/mensagens", icon: MessageSquare });
  }
  if (!mapped.some((it) => it.url === "/tasks")) {
    mapped.push({ title: "Tasks", url: "/tasks", icon: SquareKanban });
  }
  return mapped;
}

type Props = {
  dynamicItems?: UiSidebarItem[];
  onLogout?: () => void;
};

export function AppSidebar({ dynamicItems, onLogout }: Props) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useSearch({ from: "__root__" }) as RootSearch;
  const items = dynamicItems?.length ? mapDynamic(dynamicItems) : defaultItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <Link to="/" search={search} className="flex items-center gap-2">
          <img
            src="/korven-logo.png"
            alt="Korven"
            className="h-8 w-8 object-contain"
            loading="eager"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src = "/korven-logo.svg";
            }}
          />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-mono text-sm font-semibold tracking-widest text-foreground">
              KORVEN
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Lab // Console
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.25em]">
            Navegação
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = path === item.url;
                return (
                  <SidebarMenuItem key={`${item.url}-${item.title}`}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      {isDashboardHref(item.url) ? (
                        <Link
                          to={item.url}
                          search={search}
                          preload="intent"
                          className="font-mono text-xs uppercase tracking-wider"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      ) : (
                        <a href={item.url} className="font-mono text-xs uppercase tracking-wider">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </a>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="mb-2 flex items-center gap-2 rounded-sm border border-sidebar-border/70 bg-sidebar-accent/30 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground group-data-[collapsible=icon]:hidden">
          <Wrench className="h-3.5 w-3.5" />
          configurações em construção
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground group-data-[collapsible=icon]:hidden">
          <span className="h-1.5 w-1.5 animate-pulse bg-primary" />
          system online
        </div>
        <button
          type="button"
          onClick={() => onLogout?.()}
          className="mt-3 flex w-full items-center gap-2 rounded border border-border px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-accent/40"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="group-data-[collapsible=icon]:hidden">sair</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
