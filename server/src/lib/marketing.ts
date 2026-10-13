import { prisma } from "../prisma.js";
import { env } from "../env.js";

/**
 * Marketing analytics — pulls Instagram / Meta ad performance through the Graph API
 * (META_ACCESS_TOKEN + META_AD_ACCOUNT_ID, optional META_IG_USER_ID) and joins it with
 * what actually landed in the CRM (leads tagged "instagram", and what those leads bought).
 * Without keys, or if Meta errors, it returns a clearly-labelled sample.
 */

export interface Campaign {
  id: string; name: string; status: string; objective: string | null;
  spend: number; impressions: number; reach: number; clicks: number; ctr: number; cpc: number;
  leads: number; purchases: number; revenue: number; cpl: number | null; roas: number | null;
}
export interface Day { date: string; spend: number; clicks: number; leads: number; reach: number }
export interface Post { id: string; caption: string; type: string; image: string | null; url: string | null; at: string; likes: number; comments: number; engagement: number }

const LEAD_ACTIONS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_conversation_started_7d"];
const PURCHASE_ACTIONS = ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"];
type ActionRow = { action_type: string; value: string };
const sumActions = (rows: ActionRow[] | undefined, types: string[]) =>
  (rows ?? []).filter((a) => types.includes(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);

let cache: { at: number; key: string; data: unknown } | null = null;

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const u = new URL(`https://graph.facebook.com/${env.META_API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", env.META_ACCESS_TOKEN);
  const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
  const j = (await r.json()) as T & { error?: { message: string } };
  if (!r.ok || j.error) throw new Error(j.error?.message ?? `Meta API ${r.status}`);
  return j;
}

async function liveMeta(days: number) {
  const act = `act_${env.META_AD_ACCOUNT_ID}`;
  const preset = days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";
  const [camps, daily, meta] = await Promise.all([
    graph<{ data: Record<string, unknown>[] }>(`${act}/insights`, {
      level: "campaign", date_preset: preset, limit: "50",
      fields: "campaign_id,campaign_name,objective,spend,impressions,reach,clicks,ctr,cpc,actions,action_values",
    }),
    graph<{ data: Record<string, unknown>[] }>(`${act}/insights`, {
      date_preset: preset, time_increment: "1", limit: "100", fields: "spend,clicks,reach,actions",
    }),
    graph<{ data: { id: string; effective_status: string }[] }>(`${act}/campaigns`, { fields: "id,effective_status", limit: "100" }).catch(() => ({ data: [] })),
  ]);
  const statusOf = new Map(meta.data.map((c) => [c.id, c.effective_status]));
  const campaigns: Campaign[] = camps.data.map((c) => {
    const spend = Number(c.spend ?? 0), leads = sumActions(c.actions as ActionRow[], LEAD_ACTIONS);
    const purchases = sumActions(c.actions as ActionRow[], PURCHASE_ACTIONS), revenue = sumActions(c.action_values as ActionRow[], PURCHASE_ACTIONS);
    return {
      id: String(c.campaign_id), name: String(c.campaign_name), status: statusOf.get(String(c.campaign_id)) ?? "UNKNOWN", objective: (c.objective as string) ?? null,
      spend, impressions: Number(c.impressions ?? 0), reach: Number(c.reach ?? 0), clicks: Number(c.clicks ?? 0),
      ctr: Number(c.ctr ?? 0), cpc: Number(c.cpc ?? 0), leads, purchases, revenue,
      cpl: leads ? spend / leads : null, roas: spend && revenue ? revenue / spend : null,
    };
  });
  const series: Day[] = daily.data.map((d) => ({
    date: String(d.date_start), spend: Number(d.spend ?? 0), clicks: Number(d.clicks ?? 0), reach: Number(d.reach ?? 0),
    leads: sumActions(d.actions as ActionRow[], LEAD_ACTIONS),
  }));

  let posts: Post[] = [];
  let followers: number | null = null;
  if (env.META_IG_USER_ID) {
    const [prof, media] = await Promise.all([
      graph<{ followers_count?: number }>(env.META_IG_USER_ID, { fields: "followers_count" }).catch(() => ({ followers_count: undefined })),
      graph<{ data: Record<string, unknown>[] }>(`${env.META_IG_USER_ID}/media`, {
        fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count", limit: "12",
      }).catch(() => ({ data: [] })),
    ]);
    followers = prof.followers_count ?? null;
    posts = media.data.map((m) => {
      const likes = Number(m.like_count ?? 0), comments = Number(m.comments_count ?? 0);
      return {
        id: String(m.id), caption: String(m.caption ?? "").slice(0, 140), type: String(m.media_type ?? "IMAGE"),
        image: (m.thumbnail_url as string) ?? (m.media_url as string) ?? null, url: (m.permalink as string) ?? null,
        at: String(m.timestamp), likes, comments, engagement: likes + comments * 3,
      };
    });
  }
  return { campaigns, series, posts, followers };
}

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function demoMeta(days: number) {
  const r = rng(4242);
  const defs = [
    { name: "Bridal Couture · Reels", objective: "OUTCOME_LEADS", status: "ACTIVE", budget: 260, ctr: 1.9, lead: 0.024, buy: 0.03, aov: 21000 },
    { name: "Eid Gifting · Carousel", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 180, ctr: 1.5, lead: 0.014, buy: 0.08, aov: 6800 },
    { name: "Gold Souk Footfall · Stories", objective: "OUTCOME_AWARENESS", status: "ACTIVE", budget: 120, ctr: 0.9, lead: 0.006, buy: 0.12, aov: 4200 },
    { name: "Diamond Solitaires · Retargeting", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 140, ctr: 2.6, lead: 0.02, buy: 0.035, aov: 7200 },
    { name: "Men's Collection · Test", objective: "OUTCOME_TRAFFIC", status: "PAUSED", budget: 60, ctr: 0.7, lead: 0.005, buy: 0.02, aov: 3900 },
  ];
  const now = Date.now();
  const series: Day[] = [];
  const totals = defs.map(() => ({ spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, purchases: 0, revenue: 0 }));
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now - d * 864e5).toISOString().slice(0, 10);
    const dow = new Date(date).getUTCDay();
    const wk = dow === 5 || dow === 6 ? 1.25 : 1; // Fri/Sat lift (UAE weekend)
    let s = 0, c = 0, l = 0, re = 0;
    defs.forEach((def, i) => {
      if (def.status === "PAUSED" && d < days / 2) return;
      const spend = def.budget * wk * (0.8 + r() * 0.4);
      const impressions = Math.round((spend / 32) * 1000 * (0.85 + r() * 0.3)); // ~AED 32 CPM
      const reach = Math.round(impressions * (0.55 + r() * 0.1));
      const clicks = Math.round((impressions * def.ctr) / 100);
      const leads = Math.round(clicks * def.lead * (0.6 + r() * 0.8) + r() * 0.6);
      const purchases = r() < Math.min(0.9, leads * def.buy) ? 1 : 0;
      const t = totals[i];
      t.spend += spend; t.impressions += impressions; t.reach += reach; t.clicks += clicks; t.leads += leads; t.purchases += purchases; t.revenue += purchases * def.aov * (0.7 + r() * 0.6);
      s += spend; c += clicks; l += leads; re += reach;
    });
    series.push({ date, spend: Math.round(s), clicks: c, leads: l, reach: re });
  }
  const campaigns: Campaign[] = defs.map((def, i) => {
    const t = totals[i];
    return {
      id: `demo-c${i + 1}`, name: def.name, status: def.status, objective: def.objective,
      spend: Math.round(t.spend), impressions: t.impressions, reach: t.reach, clicks: t.clicks,
      ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0, cpc: t.clicks ? t.spend / t.clicks : 0,
      leads: t.leads, purchases: t.purchases, revenue: Math.round(t.revenue),
      cpl: t.leads ? t.spend / t.leads : null, roas: t.spend && t.revenue ? t.revenue / t.spend : null,
    };
  });
  const captions = [
    "The Layla rivière — 41 brilliants, one moment ✨ #bridal", "Eid gifting edit: pieces she'll wear forever", "Behind the bench: hand-setting an emerald",
    "Stacking season — 18K bangles in three golds", "Evil-eye, reimagined in enamel & gold", "Your ring, your story — custom design consultations open",
    "Gold Souk Saturdays: come say hello", "Solitaires, explained — the 4Cs in 30 seconds", "Pearls are the new neutral",
  ];
  const posts: Post[] = captions.map((caption, i) => {
    const likes = Math.round(300 + r() * 2600 * (i === 0 ? 1.8 : 1)), comments = Math.round(likes * (0.02 + r() * 0.05));
    return { id: `demo-p${i}`, caption, type: i % 3 === 0 ? "VIDEO" : "IMAGE", image: null, url: null, at: new Date(now - (i * 3 + 1) * 864e5).toISOString(), likes, comments, engagement: likes + comments * 3 };
  });
  return { campaigns, series, posts, followers: 48200 };
}

/** CRM side: leads tagged Instagram in the window, and what they turned into. */
async function crmAttribution(tenantId: string, since: Date) {
  const leads = await prisma.inquiry.findMany({
    where: { tenantId, source: "instagram", createdAt: { gte: since } },
    select: { id: true, status: true, customerId: true, budget: true },
  });
  const customerIds = leads.map((l) => l.customerId).filter((x): x is string => !!x);
  const invoices = customerIds.length
    ? await prisma.invoice.findMany({ where: { tenantId, customerId: { in: customerIds }, status: { in: ["ISSUED", "PAID", "PARTIAL"] }, createdAt: { gte: since } }, select: { total: true } })
    : [];
  return {
    leads: leads.length,
    won: leads.filter((l) => l.status === "CONVERTED").length,
    revenue: Math.round(invoices.reduce((s, i) => s + i.total, 0)),
  };
}

export async function buildMarketing(tenantId: string, source: "auto" | "live" | "demo" = "auto", days = 30) {
  const configured = !!(env.META_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID);
  const key = `${tenantId}:${source}:${days}`;
  if (cache && cache.key === key && Date.now() - cache.at < 15 * 60e3) return cache.data as ReturnType<typeof shape>;

  let used: "live" | "demo" = "demo";
  let note: string | null = null;
  let data;
  if (source !== "demo" && configured) {
    try { data = await liveMeta(days); used = "live"; }
    catch (e) { note = `Couldn't reach Instagram/Meta (${(e as Error).message}). Showing sample data.`; }
  } else if (source !== "demo") {
    note = "Instagram isn't connected yet — showing sample data. Add META_ACCESS_TOKEN and META_AD_ACCOUNT_ID on the server to pull live campaign metrics.";
  }
  if (!data) data = demoMeta(days);

  const since = new Date(Date.now() - days * 864e5);
  const crm = await crmAttribution(tenantId, since);
  const out = shape(data, used, note, configured, crm, days);
  cache = { at: Date.now(), key, data: out };
  return out;
}

function shape(
  d: { campaigns: Campaign[]; series: Day[]; posts: Post[]; followers: number | null },
  source: "live" | "demo", note: string | null, configured: boolean, crm: { leads: number; won: number; revenue: number }, days: number,
) {
  const t = d.campaigns.reduce((a, c) => ({
    spend: a.spend + c.spend, impressions: a.impressions + c.impressions, reach: a.reach + c.reach, clicks: a.clicks + c.clicks,
    leads: a.leads + c.leads, purchases: a.purchases + c.purchases, revenue: a.revenue + c.revenue,
  }), { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, purchases: 0, revenue: 0 });
  const best = [...d.campaigns].filter((c) => c.leads > 0).sort((a, b) => (a.cpl ?? 1e9) - (b.cpl ?? 1e9))[0];
  const worst = [...d.campaigns].filter((c) => c.spend > 0 && c.status === "ACTIVE").sort((a, b) => (b.cpl ?? 1e9) - (a.cpl ?? 1e9))[0];
  const insights: string[] = [];
  if (best) insights.push(`“${best.name}” brings leads cheapest at AED ${Math.round(best.cpl ?? 0)} each — consider shifting budget to it.`);
  if (worst && best && worst.id !== best.id) insights.push(`“${worst.name}” costs ${worst.cpl ? `AED ${Math.round(worst.cpl)}` : "the most"} per lead — review the creative or audience.`);
  const weekend = d.series.filter((x) => [5, 6].includes(new Date(x.date).getUTCDay()));
  const weekday = d.series.filter((x) => ![5, 6].includes(new Date(x.date).getUTCDay()));
  const avgL = (xs: Day[]) => (xs.length ? xs.reduce((s, x) => s + x.leads, 0) / xs.length : 0);
  if (avgL(weekend) > avgL(weekday) * 1.15) insights.push(`Leads run ${Math.round((avgL(weekend) / Math.max(0.1, avgL(weekday)) - 1) * 100)}% higher on Fri–Sat — schedule launches and boosts for the weekend.`);
  if (t.leads && crm.leads) insights.push(`${crm.leads} Instagram leads reached the CRM vs ${t.leads} reported by Meta — tag every DM/WhatsApp lead with source "Instagram" so nothing is lost.`);

  return {
    source, note, configured, days, generatedAt: new Date().toISOString(),
    kpis: {
      spend: Math.round(t.spend), reach: t.reach, impressions: t.impressions, clicks: t.clicks,
      ctr: t.impressions ? +((t.clicks / t.impressions) * 100).toFixed(2) : 0,
      cpc: t.clicks ? +(t.spend / t.clicks).toFixed(2) : 0,
      leads: t.leads, cpl: t.leads ? Math.round(t.spend / t.leads) : null,
      revenue: Math.round(t.revenue), roas: t.spend ? +(t.revenue / t.spend).toFixed(1) : null,
      followers: d.followers,
    },
    crm: { ...crm, costPerCrmLead: crm.leads ? Math.round(t.spend / crm.leads) : null },
    campaigns: d.campaigns.sort((a, b) => b.spend - a.spend),
    series: d.series,
    posts: d.posts.sort((a, b) => b.engagement - a.engagement).slice(0, 9),
    insights,
  };
}
