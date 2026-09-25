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
  },
  server: {
    port: 5174,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { allow: [path.resolve(__dirname, "../..")] },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
