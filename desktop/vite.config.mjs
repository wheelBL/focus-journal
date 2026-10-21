import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: './',
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: { '/api': 'http://127.0.0.1:4174' },
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  plugins: [react(), { name: 'dev-csp', transformIndexHtml(html, ctx) { return ctx.server ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") : html; } }],
});
