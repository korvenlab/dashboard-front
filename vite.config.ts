import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";

/** Build com Nitro → compatível com Vercel (Functions). Cloudflare Workers usa plugin `@cloudflare/vite-plugin` em vez de Nitro. */
export default defineConfig({
  server: { port: 3000 },
  build: {
    reportCompressedSize: false,
  },
  preview: {
    allowedHosts: [
      ".vercel.app",
      ".onrender.com",
      "dashboard-9nrn.onrender.com",
      ".korvenlab.com",
      "dashboard.korvenlab.com",
    ],
  },
  plugins: [
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      server: { entry: "server" },
    }),
    viteReact(),
    nitro(),
  ],
});
