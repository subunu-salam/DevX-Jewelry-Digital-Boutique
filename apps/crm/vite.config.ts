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
      // the shop's 3D jewellery code — the CRM builds and previews models with exactly the same engine
      "@jewel3d": path.resolve(__dirname, "../boutique/src/lib/jewel3d"),
    },
    dedupe: ["three"],
  },
  server: {
    port: 5174,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { allow: [path.resolve(__dirname, "../..")] },
  },
  // Render serves the CRM with `vite preview`; Vite blocks unknown hostnames,
  // so list the Render domains explicitly (".onrender.com" covers any subdomain).
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 5174,
    allowedHosts: [".onrender.com", "devx-jewelry-digital-boutique-crm.onrender.com", "localhost"],
  },
});
