import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, FileText, Flame, Globe, MessageCircle, Phone, Search, Store, UserRound, X } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { aed, datetime } from "@/lib/format";
import { Badge, Select } from "@/components/ui";
import { BAND, Count, Drawer, Empty, Ring, aedShort, initials, useToast } from "@/components/lux";
import QuoteModal from "@/components/QuoteModal";

interface Inquiry {
  id: string; reference: string; status: string; source: string;
  customerName: string; customerPhone: string | null; customerEmail?: string | null; branchName: string | null;
  assignedTo: string | null; assignedToId: string | null; itemCount: number;
  items: { productId: string | null; productName: string; quantity: number }[];
  budget: number | null; occasion: string | null; notes?: string | null; createdAt: string;
  ai?: { score: number; band: "Hot" | "Warm" | "Cool"; reasons: string[]; next: string };
  quotes?: { id: string; reference: string; status: string; total: number; createdAt: string }[];
}
interface TeamUser { id: string; name: string }

const STAGES = ["NEW", "QUALIFIED", "QUOTED", "APPOINTMENT", "CONVERTED", "LOST"] as const;
const STAGE_LABEL: Record<string, string> = { NEW: "New", QUALIFIED: "Qualified", QUOTED: "Quoted", APPOINTMENT: "Appointment", CONVERTED: "Won", LOST: "Lost" };
const STAGE_DOT: Record<string, string> = { NEW: "bg-info", QUALIFIED: "bg-warning", QUOTED: "bg-primary", APPOINTMENT: "bg-[#c99be8]", CONVERTED: "bg-success", LOST: "bg-danger" };
const SOURCE: Record<string, { label: string; icon: typeof Globe }> = {
  boutique: { label: "Online", icon: Globe }, whatsapp: { label: "WhatsApp", icon: MessageCircle },
  walk_in: { label: "Walk-in", icon: Store }, phone: { label: "Phone", icon: Phone },
};
const HOUR = 36e5;

function age(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / HOUR;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}
const overdue = (i: Inquiry) => i.status === "NEW" && Date.now() - new Date(i.createdAt).getTime() > 24 * HOUR;
const quoteValue = (i: Inquiry) => i.quotes?.[0]?.total ?? i.budget ?? 0;
const waLink = (phone: string, name: string, ref: string) =>
  `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hello ${name.split(" ")[0]}, thank you for your inquiry with Aurelia Fine Jewellery (${ref}). `)}`;

export default function Inquiries() {
  const toast = useToast();
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [quoteFor, setQuoteFor] = useState<Inquiry | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [owner, setOwner] = useState("");
  const [hotOnly, setHotOnly] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<string | null>(null);

  async function load() { setInquiries(await api.get<Inquiry[]>("/api/crm/sales/inquiries")); }
  useEffect(() => {
    load().catch(() => setInquiries([]));
    api.get<{ id: string; name: string }[]>("/api/crm/admin/users").then((u) => setTeam(u.map((x) => ({ id: x.id, name: x.name })))).catch(() => setTeam([]));
  }, []);

  const all = inquiries ?? [];
  const branches = useMemo(() => Array.from(new Set(all.map((i) => i.branchName).filter(Boolean))) as string[], [all]);
  const shown = all.filter((i) => {
    const t = q.trim().toLowerCase();
    if (t && !`${i.customerName} ${i.reference} ${i.customerPhone ?? ""} ${i.items.map((x) => x.productName).join(" ")}`.toLowerCase().includes(t)) return false;
    if (branch && i.branchName !== branch) return false;
    if (owner === "none" ? i.assignedToId : owner && i.assignedToId !== owner) return false;
    if (hotOnly && i.ai?.band !== "Hot") return false;
    return true;
  });

  /* Pipeline KPIs (GreenLoop-style) */
  const total = all.length;
  const won = all.filter((i) => i.status === "CONVERTED");
  const quoted = all.filter((i) => i.quotes?.length || ["QUOTED", "APPOINTMENT", "CONVERTED"].includes(i.status));
  const quotedFast = all.filter((i) => i.quotes?.some((qq) => new Date(qq.createdAt).getTime() - new Date(i.createdAt).getTime() <= 24 * HOUR));
  const withQuote = all.filter((i) => i.quotes?.length);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const openValue = all.filter((i) => !["CONVERTED", "LOST"].includes(i.status)).reduce((s, i) => s + quoteValue(i), 0);
  const wonValue = won.reduce((s, i) => s + quoteValue(i), 0);
  const stale = all.filter(overdue).length;

  async function patch(id: string, body: Partial<Pick<Inquiry, "status" | "assignedToId" | "notes">>, msg?: string) {
    const prev = inquiries;
    setInquiries((p) => p?.map((i) => (i.id === id ? { ...i, ...body, assignedTo: body.assignedToId !== undefined ? team.find((t) => t.id === body.assignedToId)?.name ?? null : i.assignedTo } : i)) ?? p);
    try { await api.patch(`/api/crm/sales/inquiries/${id}`, body); if (msg) toast(msg); }
    catch { setInquiries(prev); toast("Couldn't save that change", "warn"); }
  }
  function move(id: string, stage: string) {
    const lead = all.find((i) => i.id === id);
    if (!lead || lead.status === stage) return;
    if (stage === "LOST") {
      const reason = window.prompt("Why was this lead lost?", "Price");
      if (reason === null) return;
      patch(id, { status: stage, notes: `${lead.notes ? lead.notes + "\n" : ""}Lost: ${reason}` }, `${lead.customerName} → Lost`);
      return;
    }
    patch(id, { status: stage }, `${lead.customerName} → ${STAGE_LABEL[stage]}`);
  }

  const open = all.find((i) => i.id === openId) ?? null;
  let d = 0;
  const next = () => ({ ["--d" as string]: `${(d++) * 60}ms` }) as React.CSSProperties;

  return (
    <div className="pb-6">
      <div className="rise mb-5 flex flex-wrap items-end justify-between gap-4" style={next()}>
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Drag a card to move its stage. Every boutique inquiry lands here, scored by AI.</p>
        </div>
        <Link to="/insights" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm transition-colors hover:border-primary/50 hover:text-primary"><Flame className="size-4" /> Who to call first</Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat style={next()} label="Leads captured" value={<Count value={total} />} sub={stale ? <span className="text-warning">{stale} waiting over 24 h</span> : "all contacted"} />
        <Stat style={next()} label="Lead → sale" value={<><Count value={pct(won.length, total)} />%</>} sub={`${won.length} won`} />
        <Stat style={next()} label="Quoted within 24 h" value={<><Count value={pct(quotedFast.length, withQuote.length)} />%</>} sub={<Bar v={pct(quotedFast.length, withQuote.length)} target={90} />} />
        <Stat style={next()} label="Open pipeline" value={<Count value={openValue} format={aedShort} />} sub="budget or latest quote" />
        <Stat style={next()} label="Won value" value={<Count value={wonValue} format={aedShort} />} sub="converted leads" />
      </div>

      {/* Funnel */}
      <div className="lux-card rise mt-3 grid gap-2 p-4 sm:grid-cols-[1fr_1fr_1fr]" style={next()}>
        {[{ l: "Leads", n: total, p: 100 }, { l: "Quoted", n: quoted.length, p: pct(quoted.length, total) }, { l: "Won", n: won.length, p: pct(won.length, total) }].map((f, i) => (
          <div key={f.l}>
            <div className="mb-1 flex items-baseline justify-between text-xs"><span className="text-muted-foreground">{f.l}</span><span className="font-semibold tabular-nums">{f.n} <span className="font-normal text-muted-foreground">· {f.p}%</span></span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="bar-grow h-full rounded-full" style={{ width: `${Math.max(3, f.p)}%`, background: i === 2 ? "linear-gradient(90deg,#357426,#4ade80)" : "linear-gradient(90deg,#7d6236,#d4af6a)", ["--d" as string]: `${300 + i * 120}ms` } as React.CSSProperties} /></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rise mt-5 flex flex-wrap items-center gap-2" style={next()}>
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ref, phone, piece" aria-label="Search leads" className="h-9 w-64 rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary" />
        </label>
        <Select value={branch} onChange={setBranch} className="h-9 w-44 text-sm"><option value="">All boutiques</option>{branches.map((b) => <option key={b}>{b}</option>)}</Select>
        <Select value={owner} onChange={setOwner} className="h-9 w-40 text-sm"><option value="">Anyone</option><option value="none">Unassigned</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        <button onClick={() => setHotOnly((v) => !v)} aria-pressed={hotOnly} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors", hotOnly ? "border-[#f2a65a]/50 bg-[#2a1d10] text-[#f2a65a]" : "border-border bg-card text-muted-foreground hover:text-foreground")}><Flame className="size-4" /> Hot only</button>
        {(q || branch || owner || hotOnly) && <button onClick={() => { setQ(""); setBranch(""); setOwner(""); setHotOnly(false); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><X className="size-3" /> Clear</button>}
        <span className="ml-auto text-xs text-muted-foreground">{shown.length} of {total}</span>
      </div>

      {/* Board */}
      {inquiries === null ? (
        <div className="mt-4 flex gap-3 overflow-hidden">{STAGES.map((s) => <div key={s} className="skeleton h-80 w-[280px] shrink-0 rounded-2xl" />)}</div>
      ) : (
        <div className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-3">
          {STAGES.map((stage, si) => {
            const items = shown.filter((i) => i.status === stage);
            const value = items.reduce((s, i) => s + quoteValue(i), 0);
            return (
              <section
                key={stage}
                aria-label={`${STAGE_LABEL[stage]} column`}
                onDragOver={(e) => { e.preventDefault(); setOverLane(stage); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverLane(null); }}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); setOverLane(null); setDragId(null); if (id) move(id, stage); }}
                className={cn("rise flex w-[280px] shrink-0 snap-start flex-col rounded-2xl border border-border bg-card/60 p-2.5 transition-colors", overLane === stage && dragId && "lane-drop")}
                style={{ ["--d" as string]: `${200 + si * 60}ms` } as React.CSSProperties}
              >
                <header className="mb-2 flex items-center gap-2 px-1.5 pt-1">
                  <span className={cn("size-2 rounded-full", STAGE_DOT[stage])} />
                  <span className="text-sm font-semibold">{STAGE_LABEL[stage]}</span>
                  <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{items.length}</span>
                  {value > 0 && <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{aedShort(value)}</span>}
                </header>
                <div className="flex min-h-[120px] flex-1 flex-col gap-2">
                  {items.map((i) => <LeadCard key={i.id} i={i} dragging={dragId === i.id} onOpen={() => setOpenId(i.id)} onDragStart={(e) => { e.dataTransfer.setData("text/plain", i.id); e.dataTransfer.effectAllowed = "move"; setDragId(i.id); }} onDragEnd={() => { setDragId(null); setOverLane(null); }} />)}
                  {items.length === 0 && <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border py-8 text-xs text-muted-foreground">{dragId ? "Drop here" : "—"}</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Lead detail */}
      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.customerName ?? ""}
        subtitle={open ? <>{open.reference} · {datetime(open.createdAt)}</> : null}
        footer={open && (
          <div className="flex gap-2">
            <button onClick={() => { setQuoteFor(open); }} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-[0_0_20px_-8px_rgba(212,175,106,.6)] transition hover:bg-primary/90"><FileText className="size-4" /> Create quote</button>
            {open.customerPhone && <a href={waLink(open.customerPhone, open.customerName, open.reference)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm transition hover:border-success/50 hover:text-success"><MessageCircle className="size-4" /> WhatsApp</a>}
          </div>
        )}
      >
        {open && <LeadDetail i={open} team={team} onStage={(s) => move(open.id, s)} onAssign={(id) => patch(open.id, { assignedToId: id || null }, "Lead assigned")} />}
      </Drawer>

      {quoteFor && (
        <QuoteModal
          open
          onClose={() => setQuoteFor(null)}
          inquiryId={quoteFor.id}
          seedItems={quoteFor.items.map((it) => it.productName)}
          onSaved={() => { setQuoteFor(null); toast("Quotation created — lead moved to Quoted"); load(); }}
        />
      )}
    </div>
  );
}

function LeadCard({ i, dragging, onOpen, onDragStart, onDragEnd }: { i: Inquiry; dragging: boolean; onOpen: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  const band = i.ai ? BAND[i.ai.band.toLowerCase() as keyof typeof BAND] : null;
  const src = SOURCE[i.source] ?? { label: i.source, icon: Globe };
  const late = overdue(i);
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn("card-lift group w-full cursor-grab rounded-xl border border-border bg-card p-3 text-left active:cursor-grabbing", dragging && "dragging", late && "border-warning/40")}
    >
      <div className="flex items-start gap-2.5">
        {i.ai && band ? <Ring value={i.ai.score} size={34} stroke={3} color={band.color} /> : <span className="flex size-[34px] items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{initials(i.customerName)}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium">{i.customerName}</span>
            {band && i.ai?.band === "Hot" && <Flame className="size-3.5 shrink-0 text-[#f2a65a]" aria-label="Hot lead" />}
          </div>
          <div className="truncate text-[11.5px] text-muted-foreground">{i.items.slice(0, 2).map((x) => x.productName).join(", ") || "General inquiry"}{i.itemCount > 2 ? ` +${i.itemCount - 2}` : ""}</div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><src.icon className="size-3" />{src.label}</span>
        {i.branchName && <span className="truncate">· {i.branchName.replace(" Boutique", "").replace(" Flagship", "")}</span>}
        {(i.quotes?.[0]?.total ?? i.budget) ? <span className="ml-auto font-medium tabular-nums text-foreground/85">{aedShort(quoteValue(i))}</span> : null}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className={cn("inline-flex items-center gap-1", late ? "font-semibold text-warning" : "text-muted-foreground")}><Clock className="size-3" />{late ? `Overdue · ${age(i.createdAt)}` : age(i.createdAt)}</span>
        {i.assignedTo ? <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold" title={i.assignedTo}>{initials(i.assignedTo)}</span> : <span className="text-muted-foreground/70">Unassigned</span>}
      </div>
    </button>
  );
}

function LeadDetail({ i, team, onStage, onAssign }: { i: Inquiry; team: TeamUser[]; onStage: (s: string) => void; onAssign: (id: string) => void }) {
  const band = i.ai ? BAND[i.ai.band.toLowerCase() as keyof typeof BAND] : null;
  const idx = STAGES.indexOf(i.status as (typeof STAGES)[number]);
  return (
    <div className="space-y-5">
      {/* Stage stepper */}
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Stage</div>
        <div className="flex gap-1">
          {STAGES.filter((s) => s !== "LOST").map((s, k) => (
            <button key={s} onClick={() => onStage(s)} title={`Move to ${STAGE_LABEL[s]}`} className={cn("flex-1 rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors", i.status === "LOST" ? "bg-muted text-muted-foreground" : k <= idx ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:text-foreground", s === i.status && "ring-1 ring-primary")}>
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
        {i.status !== "LOST" ? <button onClick={() => onStage("LOST")} className="mt-2 text-[11px] text-muted-foreground hover:text-danger">Mark as lost</button> : <div className="mt-2 text-[11px] text-danger">Lost</div>}
      </div>

      {/* AI */}
      {i.ai && band && (
        <div className="rounded-xl border border-border bg-muted/40 p-3.5">
          <div className="flex items-center gap-3">
            <Ring value={i.ai.score} size={48} stroke={4} color={band.color} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">AI lead score</div>
              <div className="text-sm font-medium">{band.label} lead</div>
            </div>
          </div>
          {i.ai.reasons.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{i.ai.reasons.map((r) => <span key={r} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground/80">{r}</span>)}</div>}
          <div className="mt-3 rounded-lg bg-primary/[0.08] px-3 py-2 text-[12.5px]"><span className="font-medium text-primary">Next best action · </span>{i.ai.next}</div>
        </div>
      )}

      {/* Contact & details */}
      <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Phone</dt><dd>{i.customerPhone ? <a href={`tel:${i.customerPhone}`} className="hover:text-primary">{i.customerPhone}</a> : "—"}</dd>
        <dt className="text-muted-foreground">Email</dt><dd className="truncate">{i.customerEmail ? <a href={`mailto:${i.customerEmail}`} className="hover:text-primary">{i.customerEmail}</a> : "—"}</dd>
        <dt className="text-muted-foreground">Source</dt><dd>{SOURCE[i.source]?.label ?? i.source}</dd>
        <dt className="text-muted-foreground">Boutique</dt><dd>{i.branchName ?? "—"}</dd>
        <dt className="text-muted-foreground">Budget</dt><dd>{i.budget ? aed(i.budget) : "—"}</dd>
        <dt className="text-muted-foreground">Occasion</dt><dd>{i.occasion ?? "—"}</dd>
        <dt className="text-muted-foreground">Advisor</dt>
        <dd>
          <Select value={i.assignedToId ?? ""} onChange={onAssign} className="h-8 text-xs">
            <option value="">Unassigned</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </dd>
      </dl>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pieces of interest</div>
        {i.items.length ? (
          <ul className="space-y-1.5">{i.items.map((it, k) => <li key={k} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"><span className="truncate">{it.productName}</span><span className="text-xs text-muted-foreground">× {it.quantity}</span></li>)}</ul>
        ) : <Empty text="No pieces attached" />}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quotations <Link to="/quotes" className="normal-case tracking-normal text-primary hover:underline">All quotes</Link></div>
        {i.quotes?.length ? (
          <ul className="space-y-1.5">{i.quotes.map((qq) => <li key={qq.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"><span className="font-mono text-xs">{qq.reference}</span><span className="ml-auto tabular-nums">{aed(qq.total)}</span><Badge tone={qq.status}>{qq.status.toLowerCase()}</Badge></li>)}</ul>
        ) : <p className="text-xs text-muted-foreground">No quotations yet.</p>}
      </div>

      {i.notes && <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Notes</div><p className="whitespace-pre-line text-sm text-foreground/85">{i.notes}</p></div>}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><UserRound className="size-3.5" /> {i.assignedTo ? `Owned by ${i.assignedTo}` : "No advisor assigned yet"}</div>
    </div>
  );
}

function Stat({ label, value, sub, style }: { label: string; value: React.ReactNode; sub: React.ReactNode; style: React.CSSProperties }) {
  return (
    <div className="lux-card lux-sheen rise p-4" style={style}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-[24px] font-semibold leading-none tracking-tight">{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
function Bar({ v, target }: { v: number; target: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="bar-grow block h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: v >= target ? "#4ade80" : "#d4af6a" }} /></span>
      target {target}%
    </span>
  );
}
