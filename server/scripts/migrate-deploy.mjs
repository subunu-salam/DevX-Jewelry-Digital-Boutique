// `prisma migrate deploy` that survives a sleeping free-tier database (e.g. Neon):
// longer connect/lock timeouts, and retries while the database wakes up.
import { spawnSync } from "node:child_process";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/db");
if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "30");
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  // Pooled connections (PgBouncer) can't hold Prisma's advisory lock; deploys run one at a time.
  PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: process.env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK ?? "1",
};

const tries = 6;
for (let i = 1; i <= tries; i++) {
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status === 0) process.exit(0);
  if (i < tries) {
    const wait = 10 * i;
    console.log(`\n⟳ Database not ready (attempt ${i}/${tries}) — it may be waking up. Retrying in ${wait}s…\n`);
    await new Promise((res) => setTimeout(res, wait * 1000));
  }
}
console.error("\n✗ Could not reach the database. Check that it is running (Neon: project not suspended) and DATABASE_URL is correct.");
process.exit(1);
