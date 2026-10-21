import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
    // packages/ui isn't a workspace (no node_modules of its own), so resolve its imports from this app
    dedupe: ["react", "react-dom", "motion", "lucide-react", "clsx", "tailwind-merge"],
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { allow: [path.resolve(__dirname, "../..")] },
  },
});