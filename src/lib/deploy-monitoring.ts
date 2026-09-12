import {
  getRenderDeployMonitorEnv,
  getVercelDeployMonitorEnv,
} from "@/lib/server-env";

export type DeployMonitorRow = {
  provider: "vercel" | "render";
  project: string;
  id: string;
  status: string;
  healthy: boolean | null;
  target: string | null;
  url: string | null;
  commit: string | null;
  createdAt: string | null;
  inspectorUrl: string | null;
};

export type DeployMonitorResponse = {
  ok: boolean;
  fetchedAt: string;
  vercel: {
    skipped: boolean;
    message?: string;
    items: DeployMonitorRow[];
  };
  render: {
    skipped: boolean;
    message?: string;
    items: DeployMonitorRow[];
  };
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function vercelHealthy(state: string): boolean | null {
  const s = state.toUpperCase();
  if (s === "READY" || s === "SUCCESS") return true;
  if (s === "ERROR" || s === "CANCELED" || s === "BLOCKED") return false;
  if (
    s === "BUILDING" ||
    s === "QUEUED" ||
    s === "INITIALIZING" ||
    s === "UPLOADING"
  ) {
    return null;
  }
  return null;
}

function renderHealthy(status: string): boolean | null {
  const s = status.toLowerCase();
  if (s === "live") return true;
  if (
    s === "build_failed" ||
    s === "update_failed" ||
    s === "pre_deploy_failed" ||
    s === "canceled" ||
    s === "deactivated"
  ) {
    return false;
  }
  return null;
}

function parseNameFilter(raw: string | undefined, fallback: string[]): string[] {
  if (!raw?.trim()) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function fetchVercelDeploys(): Promise<DeployMonitorResponse["vercel"]> {
  const env = getVercelDeployMonitorEnv();
  if (!env.token) {
    return {
      skipped: true,
      message:
        "VERCEL_TOKEN (ou VERCEL_ACCESS_TOKEN) ausente. Crie um token em Vercel → Settings → Tokens.",
      items: [],
    };
  }

  const teamId = env.teamId;
  const nameFilter = parseNameFilter(env.projectFilter, [
    "dashboard-front",
    "wagbot",
    "2-a-front",
    "korvenlab",
  ]);

  const projectsUrl = new URL("https://api.vercel.com/v9/projects");
  projectsUrl.searchParams.set("limit", "50");
  if (teamId) projectsUrl.searchParams.set("teamId", teamId);

  const projectsRes = await fetch(projectsUrl.toString(), {
    headers: {
      Authorization: `Bearer ${env.token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const projectsJson = asRecord(await projectsRes.json().catch(() => ({})));
  if (!projectsRes.ok) {
    const msg =
      asString(projectsJson.error) ||
      asString(asRecord(projectsJson.error).message) ||
      `Vercel projects HTTP ${projectsRes.status}`;
    return { skipped: false, message: msg, items: [] };
  }

  const projects = asArray(projectsJson.projects)
    .map((p) => asRecord(p))
    .filter((p) => {
      const name = asString(p.name)?.toLowerCase() ?? "";
      return nameFilter.includes(name);
    })
    .slice(0, 12);

  const items: DeployMonitorRow[] = [];
  await Promise.all(
    projects.map(async (project) => {
      const projectId = asString(project.id);
      const projectName = asString(project.name) ?? projectId ?? "project";
      if (!projectId) return;

      const depUrl = new URL("https://api.vercel.com/v6/deployments");
      depUrl.searchParams.set("projectId", projectId);
      depUrl.searchParams.set("limit", "3");
      if (teamId) depUrl.searchParams.set("teamId", teamId);

      const depRes = await fetch(depUrl.toString(), {
        headers: {
          Authorization: `Bearer ${env.token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      const depJson = asRecord(await depRes.json().catch(() => ({})));
      if (!depRes.ok) return;

      for (const raw of asArray(depJson.deployments)) {
        const d = asRecord(raw);
        const state =
          asString(d.readyState) ?? asString(d.state) ?? "UNKNOWN";
        const createdMs =
          typeof d.created === "number"
            ? d.created
            : typeof d.createdAt === "number"
              ? d.createdAt
              : null;
        const meta = asRecord(d.meta);
        const urlHost = asString(d.url);
        items.push({
          provider: "vercel",
          project: projectName,
          id: asString(d.uid) ?? asString(d.id) ?? `${projectName}-${createdMs}`,
          status: state,
          healthy: vercelHealthy(state),
          target: asString(d.target),
          url: urlHost ? `https://${urlHost}` : null,
          commit:
            asString(meta.githubCommitMessage) ??
            asString(meta.gitlabCommitMessage) ??
            asString(meta.githubCommitSha)?.slice(0, 7) ??
            null,
          createdAt: createdMs ? new Date(createdMs).toISOString() : null,
          inspectorUrl: asString(d.inspectorUrl),
        });
      }
    }),
  );

  items.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  return { skipped: false, items };
}

async function fetchRenderDeploys(): Promise<DeployMonitorResponse["render"]> {
  const env = getRenderDeployMonitorEnv();
  if (!env.apiKey) {
    return {
      skipped: true,
      message:
        "RENDER_API_KEY ausente. Crie em Render → Account Settings → API Keys.",
      items: [],
    };
  }

  const nameFilter = parseNameFilter(env.serviceFilter, [
    "wag-backend",
    "wag",
    "wagoo",
  ]);

  const servicesRes = await fetch(
    "https://api.render.com/v1/services?limit=50",
    {
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  const servicesJson = await servicesRes.json().catch(() => []);
  if (!servicesRes.ok) {
    const err = asRecord(servicesJson);
    return {
      skipped: false,
      message:
        asString(err.message) || `Render services HTTP ${servicesRes.status}`,
      items: [],
    };
  }

  const services = asArray(servicesJson)
    .map((row) => {
      const wrap = asRecord(row);
      return asRecord(wrap.service ?? wrap);
    })
    .filter((s) => {
      const name = asString(s.name)?.toLowerCase() ?? "";
      if (!nameFilter.length) return true;
      return nameFilter.some((f) => name.includes(f));
    })
    .slice(0, 12);

  const items: DeployMonitorRow[] = [];
  await Promise.all(
    services.map(async (service) => {
      const serviceId = asString(service.id);
      const serviceName = asString(service.name) ?? serviceId ?? "service";
      if (!serviceId) return;

      const depRes = await fetch(
        `https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys?limit=3`,
        {
          headers: {
            Authorization: `Bearer ${env.apiKey}`,
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );
      const depJson = await depRes.json().catch(() => []);
      if (!depRes.ok) return;

      for (const raw of asArray(depJson)) {
        const wrap = asRecord(raw);
        const d = asRecord(wrap.deploy ?? wrap);
        const status = asString(d.status) ?? "unknown";
        const commit = asRecord(d.commit);
        items.push({
          provider: "render",
          project: serviceName,
          id: asString(d.id) ?? `${serviceName}-${asString(d.createdAt)}`,
          status,
          healthy: renderHealthy(status),
          target: asString(d.trigger) ?? "service",
          url: asString(service.dashboardUrl) ?? null,
          commit:
            asString(commit.message) ??
            asString(commit.id)?.slice(0, 7) ??
            null,
          createdAt: asString(d.createdAt),
          inspectorUrl: asString(service.dashboardUrl),
        });
      }
    }),
  );

  items.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  return { skipped: false, items };
}

export async function listDeployMonitoring(): Promise<DeployMonitorResponse> {
  const [vercel, render] = await Promise.all([
    fetchVercelDeploys().catch((e) => ({
      skipped: false as const,
      message: e instanceof Error ? e.message : String(e),
      items: [] as DeployMonitorRow[],
    })),
    fetchRenderDeploys().catch((e) => ({
      skipped: false as const,
      message: e instanceof Error ? e.message : String(e),
      items: [] as DeployMonitorRow[],
    })),
  ]);

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    vercel,
    render,
  };
}
