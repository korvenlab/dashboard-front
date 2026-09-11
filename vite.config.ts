import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";

/** Build com Nitro (server functions). Cloudflare Workers exige plugin próprio. */
export default defineConfig({
  server: { port: 3000 },
  build: {
    reportCompressedSize: false,
  },
  preview: {
    allowedHosts: [".vercel.app", ".korvenlab.com", "dashboard.korvenlab.com", "localhost"],
  },
  plugins: [
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      server: { entry: "server" },
    }),
    viteReact(),
    // Sem prefixo NITRO_: SUPABASE_* / UPTIMEROBOT_* da Vercel mapeiam no runtimeConfig.
    nitro({
      runtimeConfig: {
        nitro: { envPrefix: "" },
        supabaseUrl: "",
        viteSupabaseUrl: "",
        supabaseAnonKey: "",
        supabasePublishableKey: "",
        viteSupabasePublishableKey: "",
        supabaseServiceRoleKey: "",
        uptimerobotApiKey: "",
      },
    }),
  ],
});
