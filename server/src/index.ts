import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { publicRouter } from "./routes/public.js";
import { productRouter } from "./routes/products.js";
import { salesRouter } from "./routes/sales.js";
import { adminRouter } from "./routes/admin.js";
import { aiRouter } from "./routes/ai.js";
import { startGoldWorker } from "./lib/goldIngest.js";

const app = express();

/** An origin is allowed if it's listed in CORS_ORIGINS (entries may use a "*." wildcard,
 *  e.g. https://*.onrender.com) or it's one of this project's own Render sites. */
function isAllowedOrigin(origin: string): boolean {
  const o = origin.replace(/\/+$/, "").toLowerCase();
  if (env.CORS_ORIGINS.includes(o)) return true;
  if (env.CORS_ORIGINS.some((p) => p.includes("*") && new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+") + "$").test(o))) return true;
  // Built-in: the boutique + CRM static sites of this project on Render
  return /^https:\/\/devx-(jewelry-digital-boutique|boutique)[a-z0-9-]*\.onrender\.com$/.test(o);
}

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / server-to-server (no origin), dev, and allowed origins.
      if (!origin || env.NODE_ENV !== "production" || isAllowedOrigin(origin)) return cb(null, true);
      console.warn(`[cors] blocked origin: ${origin} — add it to CORS_ORIGINS`);
      return cb(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "devx-boutique-api", time: new Date().toISOString(), corsOrigins: env.CORS_ORIGINS }),
);

// Boutique (public) surface
app.use("/api/public", publicRouter);
// Auth (both surfaces)
app.use("/api/auth", authRouter);
// CRM surface
app.use("/api/crm/products", productRouter);
app.use("/api/crm/sales", salesRouter);
app.use("/api/crm/admin", adminRouter);
// AI features (visual search, catalog studio, intelligence)
app.use("/api/ai", aiRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.PORT, () => {
  console.log(`▲ DevX Boutique OS API listening on :${env.PORT} (${env.NODE_ENV})`);
  startGoldWorker();
});
