import { useEffect, useState } from "react";
import { Check, Copy, Eye, FileText, MessageCircle, Plus, Receipt, Search, Send, X } from "lucide-react";
import { cn } from "@ui";
import { api, API_URL } from "@/lib/api";
import { aed, date } from "@/lib/format";
import { Badge } from "@/components/ui";
import { Count, Drawer, Empty, aedShort, initials, useToast } from "@/components/lux";
import QuoteModal from "@/components/QuoteModal";
import DocPreview, { quoteToDoc } from "@/components/DocPreview";

interface Quote {
  id: string; reference: string; status: string; customerName: string; branchName: string | null;
  total: number; items: number; shareToken: string; validUntil: string | null; createdAt: string;
  customerPhone?: string | null; itemNames?: string[]; invoice?: { id: string; reference: string } | null; inquiryId?: string | null;
}
interface QuoteDetail {
  id: string; reference: string; status: string; subtotal: number; makingTotal: number; discount: number; taxRate: number; taxTotal: number; total: number;
  validUntil: string | null; notes: string | null; shareToken: string; createdAt: string;
  items: { id: string; description: string; metalValue: number; makingValue: number; stoneValue: number; quantity: number; lineTotal: number }[];
  customer: { name: string; phone: string | null; email: string | null } | null; branch: { name: string } | null; invoice: { reference: string } | null;
}

type Stage = "DRAFT" | "SENT" | "ACCEPTED" | "INVOICED" | "CLOSED";
const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "DRAFT", label: "Send to the customer", hint: "drafts" },
  { key: "SENT", label: "Waiting for the customer", hint: "sent" },
  { key: "ACCEPTED", label: "Ready to invoice", hint: "accepted" },
  { key: "INVOICED", label: "Invoiced", hint: "converted to sales" },
  { key: "CLOSED", label: "Closed", hint: "rejected or expired" },
];
const stageOf = (q: Quote): Stage => (q.invoice ? "INVOICED" : q.status === "REJECTED" || q.status === "EXPIRED" ? "CLOSED" : (q.status as Stage));
const DAY = 864e5;
const shareUrl = (token: string) => `${API_URL}/api/public/quotes/shared/${token}`;
const waShare = (q: { reference: string; customerName?: string; total: number; shareToken: string; customerPhone?: string | null }) =>
  `https://wa.me/${(q.customerPhone ?? "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hello${q.customerName ? " " + q.customerName.split(" ")[0] : ""}, here is your Aurelia quotation ${q.reference} (${aed(q.total)}): ${shareUrl(q.shareToken)}`)}`;

export default function Quotes() {
  const toast = useToast();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [filter, setFilter] = useState<Stage | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function load() { setQuotes(await api.get<Quote[]>("/api/crm/sales/quotes")); }
  useEffect(() => { load().catch(() => setQuotes([])); }, []);
  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    api.get<QuoteDetail>(`/api/crm/sales/quotes/${openId}`).then(setDetail).catch(() => setDetail(null));
  }, [openId]);

  const all = quotes ?? [];
  const shown = all.filter((x) => (filter === "ALL" || stageOf(x) === filter) && (!q || `${x.customerName} ${x.reference} ${(x.itemNames ?? []).join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const openVal = all.filter((x) => ["DRAFT", "SENT"].includes(stageOf(x))).reduce((s, x) => s + x.total, 0);
  const winRate = (() => { const decided = all.filter((x) => ["ACCEPTED", "INVOICED", "CLOSED"].includes(stageOf(x))); return decided.length ? Math.round((decided.filter((x) => stageOf(x) !== "CLOSED").length / decided.length) * 100) : 0; })();

  async function setStatus(id: string, status: string, msg: string) {
    const prev = quotes;
    setQuotes((p) => p?.map((x) => (x.id === id ? { ...x, status } : x)) ?? p);
    try { await api.patch(`/api/crm/sales/quotes/${id}`, { status }); toast(msg); if (openId === id) setDetail((d) => (d ? { ...d, status } : d)); }
    catch { setQuotes(prev); toast("Couldn't update the quotation", "warn"); }
  }
  async function invoice(id: string) {
    try {
      const r = await api.post<{ reference: string }>(`/api/crm/sales/quotes/${id}/convert`);
      toast(`Invoice ${r.reference} created`);
      load();
      if (openId === id) api.get<QuoteDetail>(`/api/crm/sales/quotes/${id}`).then(setDetail).catch(() => {});
    } catch (e) { toast((e as Error).message, "warn"); }
  }
  function copy(token: string) { navigator.clipboard?.writeText(shareUrl(token)).then(() => toast("Share link copied")).catch(() => toast("Copy failed — select the link manually", "warn")); }

  let d = 0;
  const next = () => ({ ["--d" as string]: `${(d++) * 60}ms` }) as React.CSSProperties;

  return (
    <div className="pb-6">
      <div className="rise mb-5 flex flex-wrap items-end justify-between gap-4" style={next()}>
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Quotations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Priced proposals with a shareable link — accepted quotes become invoices in one click.</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-[0_0_24px_-8px_rgba(212,175,106,.6)] transition hover:bg-primary/90"><Plus className="size-4" /> New quotation</button>
      </div>

      {/* Stage strip */}
      <div role="tablist" aria-label="Quotation stage" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {STAGES.map((s) => {
          const list = all.filter((x) => stageOf(x) === s.key);
          const on = filter === s.key;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(on ? "ALL" : s.key)}
              className={cn("lux-card rise group p-4 text-left", on && "!border-primary/60 shadow-[0_0_0_1px_rgba(212,175,106,.25),0_0_30px_-12px_rgba(212,175,106,.6)]")}
              style={next()}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[26px] font-semibold leading-none tabular-nums"><Count value={list.length} /></span>
                <span className="text-xs tabular-nums text-muted-foreground">{aedShort(list.reduce((t, x) => t + x.total, 0))}</span>
              </div>
              <div className={cn("mt-2 text-[13px] font-medium transition-colors", on ? "text-primary" : "group-hover:text-primary")}>{s.label}</div>
              <div className="text-[11px] text-muted-foreground">{s.hint}</div>
            </button>
          );
        })}
      </div>

      <div className="rise mt-5 flex flex-wrap items-center gap-2" style={next()}>
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, ref or piece" aria-label="Search quotations" className="h-9 w-64 rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary" />
        </label>
        {filter !== "ALL" && <button onClick={() => setFilter("ALL")} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary">{STAGES.find((s) => s.key === filter)?.label} <X className="size-3" /></button>}
        <span className="ml-auto text-xs text-muted-foreground">{all.filter((x) => ["DRAFT", "SENT"].includes(stageOf(x))).length} open, worth {aed(openVal)} · win rate {winRate}%</span>
      </div>

      {/* List */}
      <div className="lux-card rise mt-3 overflow-hidden" style={next()}>
        {quotes === null ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        ) : shown.length === 0 ? (
          <div className="p-6"><Empty text={all.length ? "No quotations at this stage." : "No quotations yet — create one from a lead."} /></div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((x, i) => {
              const st = stageOf(x);
              const daysLeft = x.validUntil ? Math.ceil((new Date(x.validUntil).getTime() - Date.now()) / DAY) : null;
              return (
                <li key={x.id} className="rise" style={{ ["--d" as string]: `${300 + i * 40}ms` } as React.CSSProperties}>
                  <div role="button" tabIndex={0} onClick={() => setOpenId(x.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(x.id)} className="group grid cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 md:grid-cols-[1.3fr_1.4fr_0.9fr_0.8fr_auto]">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(x.customerName)}</span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{x.customerName}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{x.reference}{x.branchName ? ` · ${x.branchName}` : ""}</div>
                      </div>
                    </div>
                    <div className="min-w-0 text-[12.5px] text-foreground/80">
                      <span className="line-clamp-1">{(x.itemNames ?? []).slice(0, 2).join(", ") || `${x.items} item${x.items === 1 ? "" : "s"}`}</span>
                      {x.items > 2 && <span className="text-[11px] text-muted-foreground">and {x.items - 2} more</span>}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {x.validUntil ? <>Valid to {date(x.validUntil)}{st === "SENT" && daysLeft !== null && daysLeft <= 3 && <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold", daysLeft < 0 ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning")}>{daysLeft < 0 ? "expired" : `${daysLeft}d left`}</span>}</> : "No expiry"}
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums md:text-left">{aed(x.total)}</div>
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <Badge tone={x.invoice ? "COMPLETED" : x.status}>{x.invoice ? "invoiced" : x.status.toLowerCase()}</Badge>
                      {st === "DRAFT" && <Action icon={Send} label="Mark sent" onClick={() => setStatus(x.id, "SENT", `${x.reference} marked as sent`)} />}
                      {st === "SENT" && <Action icon={Check} label="Accepted" onClick={() => setStatus(x.id, "ACCEPTED", `${x.reference} accepted`)} />}
                      {st === "ACCEPTED" && <Action primary icon={Receipt} label="Create invoice" onClick={() => invoice(x.id)} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Drawer
        open={!!openId}
        onClose={() => setOpenId(null)}
        title={detail ? detail.reference : "Quotation"}
        subtitle={detail ? <>{detail.customer?.name ?? "—"}{detail.branch ? ` · ${detail.branch.name}` : ""} · {date(detail.createdAt)}</> : null}
        footer={detail && (
          <div className="flex flex-wrap gap-2">
            {detail.status === "DRAFT" && <button onClick={() => setStatus(detail.id, "SENT", `${detail.reference} marked as sent`)} className="btn-gold flex-1"><Send className="size-4" /> Mark as sent</button>}
            {detail.status === "SENT" && <>
              <button onClick={() => setStatus(detail.id, "ACCEPTED", `${detail.reference} accepted`)} className="btn-gold flex-1"><Check className="size-4" /> Accepted</button>
              <button onClick={() => setStatus(detail.id, "REJECTED", `${detail.reference} marked rejected`)} className="btn-line">Rejected</button>
            </>}
            {detail.status === "ACCEPTED" && !detail.invoice && <button onClick={() => invoice(detail.id)} className="btn-gold flex-1"><Receipt className="size-4" /> Create invoice</button>}
            {detail.invoice && <span className="inline-flex flex-1 items-center gap-1.5 text-sm text-success"><Receipt className="size-4" /> Invoiced as {detail.invoice.reference}</span>}
          </div>
        )}
      >
        {!detail ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div> : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <Badge tone={detail.invoice ? "COMPLETED" : detail.status}>{detail.invoice ? "invoiced" : detail.status.toLowerCase()}</Badge>
              <span className="text-xs text-muted-foreground">{detail.validUntil ? `Valid to ${date(detail.validUntil)}` : "No expiry"}</span>
            </div>
            <div className="rounded-xl border border-border bg-muted/30">
              <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-3.5 py-2 text-[11px] uppercase tracking-wider text-muted-foreground"><span>Piece</span><span>Line total</span></div>
              {detail.items.map((it) => (
                <div key={it.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border/60 px-3.5 py-2.5 last:border-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{it.description}{it.quantity > 1 ? <span className="text-muted-foreground"> × {it.quantity}</span> : null}</div>
                    <div className="text-[11px] text-muted-foreground">Metal {aed(it.metalValue)} · Making {aed(it.makingValue)}{it.stoneValue ? ` · Stones ${aed(it.stoneValue)}` : ""}</div>
                  </div>
                  <div className="text-sm font-medium tabular-nums">{aed(it.lineTotal)}</div>
                </div>
              ))}
            </div>
            <dl className="space-y-1.5 text-sm">
              <Row k="Metal" v={aed(detail.subtotal)} />
              <Row k="Making & stones" v={aed(detail.makingTotal)} />
              {detail.discount > 0 && <Row k="Discount" v={`− ${aed(detail.discount)}`} />}
              <Row k={`VAT ${detail.taxRate}%`} v={aed(detail.taxTotal)} />
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold"><span>Total</span><span className="gold-text tabular-nums">{aed(detail.total)}</span></div>
            </dl>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Share with the customer</div>
              <div className="flex gap-2">
                <button onClick={() => setPreviewing(true)} className="btn-line flex-1"><Eye className="size-4" /> Preview</button>
                <button onClick={() => copy(detail.shareToken)} className="btn-line flex-1"><Copy className="size-4" /> Copy link</button>
                <a href={waShare({ reference: detail.reference, customerName: detail.customer?.name, total: detail.total, shareToken: detail.shareToken, customerPhone: detail.customer?.phone })} target="_blank" rel="noopener noreferrer" className="btn-line flex-1 hover:!border-success/50 hover:!text-success"><MessageCircle className="size-4" /> WhatsApp</a>
                <a href={shareUrl(detail.shareToken)} target="_blank" rel="noopener noreferrer" className="btn-line"><FileText className="size-4" /> View</a>
              </div>
            </div>
            {detail.notes && <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Notes</div><p className="whitespace-pre-line text-sm text-foreground/85">{detail.notes}</p></div>}
          </div>
        )}
      </Drawer>
      <DocPreview d={previewing && detail ? quoteToDoc(detail) : null} onClose={() => setPreviewing(false)} />

      {creating && <QuoteModal open onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast("Quotation created"); load(); }} />}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between text-muted-foreground"><span>{k}</span><span className="tabular-nums text-foreground/90">{v}</span></div>;
}
function Action({ icon: Icon, label, onClick, primary }: { icon: typeof Send; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition", primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:border-primary/50 hover:text-primary")}>
      <Icon className="size-3.5" /> {label}
    </button>
  );
}
