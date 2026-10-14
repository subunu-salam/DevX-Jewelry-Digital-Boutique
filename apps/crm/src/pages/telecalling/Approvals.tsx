import { useEffect, useState } from "react";
import { BadgeCheck, Check, Clock, Copy, MessageCircle, ShieldCheck, ShoppingBag, X } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { aed, date, datetime } from "@/lib/format";
import { Button, Field, Input, Modal } from "@/components/ui";
import { Empty, Segmented, initials, useToast } from "@/components/lux";
import TelecallingShell from "@/components/TelecallingShell";
import { waLink } from "@/lib/retention";
import { SEGMENT_LABEL, offerText, useTeleConfig, type Offer, type Segment } from "@/lib/telecalling";

type Tab = "PENDING" | "APPROVED" | "REDEEMED" | "REJECTED" | "ALL";
const TABS: { value: Tab; label: string }[] = [{ value: "PENDING", label: "Waiting" }, { value: "APPROVED", label: "Approved" }, { value: "REDEEMED", label: "Redeemed" }, { value: "REJECTED", label: "Rejected" }, { value: "ALL", label: "All" }];
const STATUS: Record<string, string> = { PENDING: "bg-warning-bg text-warning", APPROVED: "bg-success-bg text-success", REDEEMED: "bg-info-bg text-info", REJECTED: "bg-danger-bg text-danger", EXPIRED: "bg-muted text-muted-foreground" };

export default function Approvals() {
  const toast = useToast();
  const cfg = useTeleConfig();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [mine, setMine] = useState(false);
  const [data, setData] = useState<{ canApprove: boolean; offers: Offer[] } | null>(null);
  const [deciding, setDeciding] = useState<{ o: Offer; approve: boolean } | null>(null);
  const [redeeming, setRedeeming] = useState<Offer | null>(null);

  const load = () => api.get<{ canApprove: boolean; offers: Offer[] }>(`/api/crm/telecalling/offers${mine ? "?mine=1" : ""}`).then(setData).catch(() => setData({ canApprove: false, offers: [] }));
  useEffect(() => { load(); }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = data?.offers ?? [];
  const shown = all.filter((o) => tab === "ALL" || o.status === tab);
  const count = (s: Tab) => all.filter((o) => o.status === s).length;
  const redeemedValue = all.filter((o) => o.status === "REDEEMED").reduce((s, o) => s + (o.redeemedAmount ?? 0), 0);
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast("Code copied")).catch(() => {});

  return (
    <TelecallingShell
      title="Offer approvals"
      subtitle="Telecallers request offers for customers they've spoken to. Small offers inside the policy are approved instantly; anything larger waits here for a manager. Approved offers get a code to share; mark them redeemed when the customer buys."
      actions={<label className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-[#d4af6a]" /> My requests</label>}
    >
      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat k="Waiting for a manager" v={count("PENDING")} warn={count("PENDING") > 0} />
            <Stat k="Approved, not used yet" v={count("APPROVED")} />
            <Stat k="Redeemed" v={count("REDEEMED")} />
            <Stat k="Sales from offers" v={aed(redeemedValue)} />
          </div>
          <div className="mb-3"><Segmented options={TABS} value={tab} onChange={setTab} /></div>
          {!data ? <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
            : shown.length === 0 ? <div className="lux-card p-8"><Empty text={tab === "PENDING" ? "Nothing waiting for approval." : "No offers here yet."} /></div>
              : (
                <div className="space-y-3">
                  {shown.map((o) => (
                    <div key={o.id} className="lux-card rise p-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(o.customerName)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{o.customerName}</span>
                            {o.callTask?.tier && <span className="rounded-full border border-primary/40 px-1.5 py-px text-[10px] font-semibold text-primary">{o.callTask.tier}</span>}
                            {o.callTask?.segment && <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{SEGMENT_LABEL[o.callTask.segment as Segment]}</span>}
                            <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", STATUS[o.status])}>{o.status.toLowerCase()}{o.autoApproved ? " · auto" : ""}</span>
                          </div>
                          <div className="mt-1 text-lg font-semibold text-primary">{offerText(o.type, o.value, cfg)}</div>
                          <p className="mt-1 text-sm text-foreground/85">{o.reason}</p>
                          {(o.callTask?.lostReason || o.callTask?.feedback) && (
                            <div className="mt-2 rounded-lg bg-muted/40 p-2.5 text-xs leading-5">
                              {o.callTask.lostReason && <div><span className="text-muted-foreground">Why they haven't bought:</span> {o.callTask.lostReason}</div>}
                              {o.callTask.feedback && <div><span className="text-muted-foreground">Customer said:</span> {o.callTask.feedback}</div>}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{o.reference} · requested by {o.requestedBy ?? "—"} · {datetime(o.createdAt)}</span>
                            {o.decidedBy && o.status !== "PENDING" && <span>{o.status === "REJECTED" ? "Rejected" : "Approved"} by {o.decidedBy}{o.decisionNote ? ` — “${o.decisionNote}”` : ""}</span>}
                            {o.validUntil && o.status === "APPROVED" && <span>valid until {date(o.validUntil)}</span>}
                            {o.status === "REDEEMED" && <span className="text-info">Redeemed {date(o.redeemedAt)} · sale {aed(o.redeemedAmount ?? 0)}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {o.status === "PENDING" && data.canApprove && (
                            <div className="flex gap-2">
                              <button onClick={() => setDeciding({ o, approve: false })} className="btn-line !h-8 !text-xs hover:!border-danger/50 hover:!text-danger"><X className="size-3.5" /> Reject</button>
                              <button onClick={() => setDeciding({ o, approve: true })} className="btn-gold !h-8 !text-xs"><Check className="size-3.5" /> Approve</button>
                            </div>
                          )}
                          {o.status === "PENDING" && !data.canApprove && <span className="text-xs text-warning">Waiting for a manager</span>}
                          {o.status === "APPROVED" && o.code && (
                            <>
                              <button onClick={() => copy(o.code!)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary/60 px-3 py-1.5 font-mono text-sm text-primary"><Copy className="size-3.5" />{o.code}</button>
                              <div className="flex gap-2">
                                {o.customerPhone && <a target="_blank" rel="noopener noreferrer" href={waLink(o.customerPhone, `Hello ${o.customerName.split(" ")[0]}, as promised — your Aurelia offer: ${offerText(o.type, o.value, cfg)}. Use code ${o.code} at any of our boutiques before ${date(o.validUntil)}.`)} className="btn-line !h-8 !text-xs"><MessageCircle className="size-3.5" /> Send</a>}
                                <button onClick={() => setRedeeming(o)} className="btn-line !h-8 !text-xs"><ShoppingBag className="size-3.5" /> Mark redeemed</button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </div>

        <aside className="lux-card h-fit p-4 text-sm">
          <div className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-primary" /> Offer policy</div>
          <p className="mt-1 text-xs text-muted-foreground">What a telecaller can give without a manager. Above these limits, the request comes here.</p>
          <ul className="mt-3 space-y-2">
            {Object.entries(cfg?.offerTypes ?? {}).map(([k, t]) => (
              <li key={k} className="rounded-lg bg-muted/40 p-2.5 text-xs">
                <div className="font-medium">{t.label}</div>
                <div className="text-muted-foreground">{t.autoLimit ? `Telecaller: up to ${t.autoLimit}${t.unit === "%" ? "%" : ` ${t.unit}`}` : "Always needs a manager"} · max {t.max}{t.unit === "%" ? "%" : ` ${t.unit}`}</div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-border p-2.5 text-xs text-muted-foreground"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />Managers: Owner, Company admin and Branch managers. Their own offers are approved directly.</div>
        </aside>
      </div>

      <DecideModal d={deciding} onClose={() => setDeciding(null)} onDone={(msg) => { setDeciding(null); toast(msg); load(); }} cfgUnit={deciding ? cfg?.offerTypes[deciding.o.type]?.unit : undefined} />
      <RedeemModal o={redeeming} onClose={() => setRedeeming(null)} onDone={() => { setRedeeming(null); toast("Marked as redeemed — counted as converted business"); load(); }} />
    </TelecallingShell>
  );
}

function Stat({ k, v, warn }: { k: string; v: string | number; warn?: boolean }) {
  return <div className="lux-card p-3"><div className="text-[11px] text-muted-foreground">{k}</div><div className={cn("text-xl font-semibold tabular-nums", warn && "text-warning")}>{v}</div></div>;
}

function DecideModal({ d, onClose, onDone, cfgUnit }: { d: { o: Offer; approve: boolean } | null; onClose: () => void; onDone: (msg: string) => void; cfgUnit?: string }) {
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (d) { setNote(""); setValue(String(d.o.value)); setError(null); } }, [d]);
  if (!d) return null;
  async function go() {
    if (!d!.approve && note.trim().length < 3) { setError("Tell the telecaller why — it helps them go back to the client."); return; }
    setBusy(true);
    try {
      await api.patch(`/api/crm/telecalling/offers/${d!.o.id}/decide`, { decision: d!.approve ? "APPROVE" : "REJECT", note: note.trim() || undefined, value: d!.approve ? Number(value) : undefined });
      onDone(d!.approve ? `Approved ${d!.o.reference}` : `Rejected ${d!.o.reference}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`${d.approve ? "Approve" : "Reject"} offer · ${d.o.customerName}`}>
      {d.approve && <Field label={`Approved value (${cfgUnit ?? ""}) — you can approve less than requested`}><Input type="number" value={value} onChange={setValue} /></Field>}
      <div className="mt-3"><Field label={d.approve ? "Note for the telecaller (optional)" : "Reason *"}><Input value={note} onChange={setNote} placeholder={d.approve ? "e.g. Approve — top Platinum client" : "e.g. Offer 5% instead; gold rate lock is better here"} /></Field></div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={d.approve ? "primary" : "danger"} onClick={go} disabled={busy}>{busy ? "Saving…" : d.approve ? "Approve" : "Reject"}</Button></div>
    </Modal>
  );
}

function RedeemModal({ o, onClose, onDone }: { o: Offer | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (o) { setAmount(""); setError(null); } }, [o]);
  if (!o) return null;
  async function go() {
    if (!Number(amount)) { setError("Enter the sale amount."); return; }
    setBusy(true);
    try { await api.patch(`/api/crm/telecalling/offers/${o!.id}/redeem`, { amount: Number(amount) }); onDone(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Offer redeemed · ${o.customerName}`}>
      <Field label="Sale amount (AED)"><Input type="number" value={amount} onChange={setAmount} placeholder="e.g. 18400" /></Field>
      <p className="mt-2 text-xs text-muted-foreground">This counts toward the business converted by telecalling.</p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={busy}>{busy ? "Saving…" : "Mark redeemed"}</Button></div>
    </Modal>
  );
}
