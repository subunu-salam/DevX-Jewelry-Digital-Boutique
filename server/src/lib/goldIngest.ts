import { prisma } from "../prisma.js";
import { env } from "../env.js";

const GRAMS_PER_OZ = 31.1034768;
// 24K treated as pure; others by fineness.
const KARAT_PURITY: Record<number, number> = { 24: 1.0, 22: 0.916, 21: 0.875, 18: 0.75 };

/**
 * Fetch a live 24K spot price and persist an observation per karat for every
 * tenant. Server-side only. Returns observations written (0 when disabled/failed).
 *
 * Default provider is "gold-api" — https://api.gold-api.com/price/XAU — which is
 * free and requires NO API key. It returns gold in USD per troy ounce; we convert
 * to AED per gram (USD→AED rate configurable, default 3.6725) per karat.
 */
export async function ingestGold(): Promise<number> {
  if (env.GOLD_PROVIDER === "none") return 0;
  try {
    const perGram24 = await fetchSpotAedPerGram();
    if (!perGram24) return 0;
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    let written = 0;
    for (const t of tenants) {
      for (const [karatStr, purity] of Object.entries(KARAT_PURITY)) {
        await prisma.goldPriceObservation.create({
          data: {
            tenantId: t.id,
            karat: Number(karatStr),
            pricePerGram: +(perGram24 * purity).toFixed(2),
            source: "API",
          },
        });
        written++;
      }
    }
    return written;
  } catch (err) {
    console.error("[gold] ingest failed:", (err as Error).message);
    return 0;
  }
}

/** Returns 24K AED/gram, or null on failure. */
async function fetchSpotAedPerGram(): Promise<number | null> {
  // Keyless default — gold-api.com
  if (env.GOLD_PROVIDER === "gold-api" || env.GOLD_PROVIDER === "goldapi_com") {
    const r = await fetch("https://api.gold-api.com/price/XAU");
    if (!r.ok) return null;
    const j = (await r.json()) as { price?: number };
    if (!j.price) return null;
    return +((j.price / GRAMS_PER_OZ) * env.USD_AED).toFixed(2); // USD/oz → USD/g → AED/g
  }
  // GoldAPI.io (needs key) — already AED/gram
  if (env.GOLD_PROVIDER === "goldapi" && env.GOLDAPI_KEY) {
    const r = await fetch("https://www.goldapi.io/api/XAU/AED", { headers: { "x-access-token": env.GOLDAPI_KEY } });
    if (!r.ok) return null;
    const j = (await r.json()) as { price_gram_24k?: number };
    return j.price_gram_24k ?? null;
  }
  // Metals.dev (needs key)
  if (env.GOLD_PROVIDER === "metalsdev" && env.METALSDEV_KEY) {
    const r = await fetch(`https://api.metals.dev/v1/latest?api_key=${env.METALSDEV_KEY}&currency=AED&unit=g`);
    if (!r.ok) return null;
    const j = (await r.json()) as { metals?: { gold?: number } };
    return j.metals?.gold ?? null;
  }
  return null;
}

export function startGoldWorker() {
  if (env.GOLD_PROVIDER === "none") {
    console.log("[gold] provider=none — using persisted history + manual override only");
    return;
  }
  const ms = env.GOLD_INGEST_INTERVAL_MINUTES * 60 * 1000;
  ingestGold().then((n) => console.log(n ? `[gold] live rate ingested (${n} observations, provider=${env.GOLD_PROVIDER})` : "[gold] initial ingest returned nothing — using persisted history"));
  setInterval(() => {
    ingestGold().then((n) => n && console.log(`[gold] ingested ${n} observations`));
  }, ms);
}
