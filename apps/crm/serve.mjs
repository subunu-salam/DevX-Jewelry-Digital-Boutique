// Minimal production server for the CRM build (no host check, SPA fallback).
// Used on Render instead of `vite preview`, which blocks unknown hostnames.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT) || 5174;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};

async function send(res, file, status = 200) {
  const body = await readFile(file);
  const ext = extname(file);
  res.writeHead(status, {
    "Content-Type": types[ext] ?? "application/octet-stream",
    "Cache-Control": file.includes(`${join("dist", "assets")}`) ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = normalize(join(root, url));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const s = await stat(file).catch(() => null);
    if (s?.isFile()) return await send(res, file);
    return await send(res, join(root, "index.html")); // SPA routes
  } catch {
    res.writeHead(500).end("Server error");
  }
}).listen(port, "0.0.0.0", () => console.log(`CRM serving dist on :${port}`));
