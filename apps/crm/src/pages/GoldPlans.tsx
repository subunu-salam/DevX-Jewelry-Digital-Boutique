import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, Coins, Gem, Plus, Scale, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { aed, date } from "@/lib/format";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { Count, DemoBadge, Drawer, Empty, Segmented, aedShort, initials, useToast } from "@/components/lux";

type PlanType = "INSTALMENT" | "ACCUMULATION";
interface Plan {
  id: string; reference: string; type: PlanType; status: string; karat: number; monthlyAmount: number; tenureMonths: number; bonusPct: number;
  startDate: string; maturityDate: string; nominee: string | null; customer: { id: string; name: string; phone: string | null };
  instalmentsPaid: number; paid: number; grams: number; avgRate: number | null; currentValue: number; gain: number; bonus: number; maturityValue: number | null;
  missed: number; nextDue: string | null; matured: boolean; payments: { id: string; amount: number; goldRate: number; grams: number; method: string; paidAt: string }[];
}
interface Book {
  source: "live" | "demo"; note: string | null; rate: number; karat: number;
  kpis: { active: number; monthlyCommitted: number; collected: number; collectedThisMonth: number; gramsHeld: number; maturing30: number; missed: number; bonusLiability: number };
  plans: Plan[];
}
const TYPE: Record<PlanType, { name: string; short: string; color: string }> = {
  INSTALMENT: { name: "Golden Harvest", short: "11 monthly instalments + bonus", color: "#d4af6a" },
  ACCUMULATION: { name: "Gold Reserve", short: "Buy gold grams every month", color: "#60a5fa" },
};
type Filter = "ACTIVE" | "DUE" | "MATURED" | "ALL";
const FILTERS: { value: Filter; label: string }[] = [{ value: "ACTIVE", label: "Active" }, { value: "DUE", label: "Missed payment" }, { value: "MATURED", label: "Ready to redeem" }, { value: "ALL", label: "All" }];

export default function GoldPlans() {
  const toast = useToast();
  const [src, setSrc] = useState<"auto" | "live" | "demo">("auto");
  const [book, setBook] = useState<Book | null>(null);
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [enrol, setEnrol] = useState<PlanType | null>(null);
  const [open, setOpen] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get<Book>(`/api/crm/gold-plans${src === "auto" ? "" : `?source=${src}`}`).then(setBook).catch(() => {});
  useEffect(() => { setBook(null); load(); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const demo = book?.source === "demo";

  const rows = useMemo(() => (book?.plans ?? []).filter((p) =>
    filter === "ALL" || (filter === "ACTIVE" ? p.status === "ACTIVE" : filter === "DUE" ? p.missed > 0 : p.matured && p.status !== "REDEEMED"),
  ), [book, filter]);

  async function pay(p: Plan) {
    if (demo) { toast("Sample plan — enrol a real client to record payments", "warn"); return; }
    setBusy(true);
    try { await api.post(`/api/crm/gold-plans/${p.id}/payments`, { method: "CARD" }); toast(`Instalment of ${aed(p.monthlyAmount)} recorded`); await load(); setOpen(null); }
    catch (e) { toast((e as Error).message, "warn"); } finally { setBusy(false); }
  }
  async function redeem(p: Plan) {
    if (demo) { toast("Sample plan — enrol a real client to redeem", "warn"); return; }
    setBusy(true);
    try { await api.patch(`/api/crm/gold-plans/${p.id}`, { status: "REDEEMED" }); toast(`${p.reference} redeemed — create the invoice for the jewellery`); await load(); setOpen(null); }
    catch (e) { toast((e as Error).message, "warn"); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[28px] font-semibold tracking-tight"><Coins className="size-6 text-primary" /> Gold Savings Plans</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Monthly gold savings schemes in place of loyalty points: the client builds value every month, the boutique's only cost is a capped bonus paid when they buy jewellery.</p>
        </div>
        <div className="flex items-center gap-2">
          {book && <DemoBadge source={book.source} note={book.note ?? undefined} />}
          <Segmented options={[{ value: "auto", label: "Auto" }, { value: "live", label: "My data" }, { value: "demo", label: "Demo data" }]} value={src} onChange={setSrc} />
        </div>
      </div>
      {book?.note && <p className="mb-3 text-xs text-warning">{book.note}</p>}

      {/* Products */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProductCard type="INSTALMENT" icon={CalendarCheck} onEnrol={() => setEnrol("INSTALMENT")}
          points={["Pay a fixed amount every month for 11 months (from AED 250)", "We add 75% of one instalment as a bonus at maturity", "Redeem the full value against any jewellery", "Example: AED 2,000/month → AED 22,000 paid + AED 1,500 bonus = AED 23,500 to spend"]} />
        <ProductCard type="ACCUMULATION" icon={Scale} onEnrol={() => setEnrol("ACCUMULATION")} rate={book?.rate}
          points={["Every payment buys 22K gold at that day's rate", "Protects the client if gold prices rise", "50% off making charges when redeemed as jewellery", "Ideal for clients who otherwise buy gold on trips to India"]} />
      </div>

      {!book ? <div className="mt-5 grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div> : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi k="Active plans" v={<Count value={book.kpis.active} />} sub={`${aedShort(book.kpis.monthlyCommitted)} committed / month`} />
            <Kpi k="Collected to date" v={<Count value={book.kpis.collected} format={aedShort} />} sub={`${aedShort(book.kpis.collectedThisMonth)} this month`} />
            <Kpi k="Gold held for clients" v={<>{book.kpis.gramsHeld.toLocaleString()} g</>} sub={`22K at ${aed(book.rate)}/g today`} />
            <Kpi k="Maturing in 30 days" v={<Count value={book.kpis.maturing30} />} sub="expect redemptions" />
            <Kpi k="Missed instalments" v={<Count value={book.kpis.missed} />} sub="sent to telecalling" warn={book.kpis.missed > 0} />
            <Kpi k="Bonus liability" v={<Count value={book.kpis.bonusLiability} format={aedShort} />} sub="paid only on redemption" />
          </div>

          <section className="lux-card mt-5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Segmented options={FILTERS} value={filter} onChange={setFilter} />
              <button onClick={() => setEnrol("INSTALMENT")} className="btn-gold"><Plus className="size-4" /> Enrol client</button>
            </div>
            {rows.length === 0 ? <Empty text="No plans in this view." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Client</th><th className="py-2 pr-3 font-medium">Plan</th><th className="py-2 pr-3 font-medium">Progress</th>
                    <th className="py-2 pr-3 text-right font-medium">Paid</th><th className="py-2 pr-3 text-right font-medium">Value today</th><th className="py-2 pr-3 font-medium">Next</th><th className="py-2 text-right font-medium" />
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((p) => (
                      <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(p)}>
                        <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{initials(p.customer.name)}</span><div><div className="font-medium">{p.customer.name}</div><div className="text-[11px] text-muted-foreground">{p.reference}</div></div></div></td>
                        <td className="py-2.5 pr-3"><span className="inline-flex items-center gap-1.5 text-xs"><span className="size-2 rounded-full" style={{ background: TYPE[p.type].color }} />{TYPE[p.type].name}</span><div className="text-[11px] text-muted-foreground">{aed(p.monthlyAmount)}/month</div></td>
                        <td className="py-2.5 pr-3"><Dots paid={p.instalmentsPaid} total={p.tenureMonths} missed={p.missed} /><div className="mt-1 text-[11px] text-muted-foreground">{p.instalmentsPaid} of {p.tenureMonths}</div></td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{aed(p.paid)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{aed(p.currentValue + (p.type === "INSTALMENT" && p.matured ? p.bonus : 0))}{p.type === "ACCUMULATION" ? <div className={cn("text-[11px]", p.gain >= 0 ? "text-success" : "text-danger")}>{p.grams} g · {p.gain >= 0 ? "+" : ""}{aed(p.gain)}</div> : <div className="text-[11px] text-muted-foreground">+ {aed(p.bonus)} bonus at maturity</div>}</td>
                        <td className="py-2.5 pr-3 text-xs">{p.status === "REDEEMED" ? <span className="text-muted-foreground">Redeemed</span> : p.matured ? <span className="text-success">Ready to redeem</span> : p.missed ? <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="size-3.5" />{p.missed} missed</span> : <>Due {date(p.nextDue)}</>}</td>
                        <td className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          {p.status === "ACTIVE" && !p.matured && <button disabled={busy} onClick={() => pay(p)} className="btn-line !h-8 !text-xs"><Wallet className="size-3.5" /> Record payment</button>}
                          {p.matured && p.status !== "REDEEMED" && <button disabled={busy} onClick={() => redeem(p)} className="btn-gold !h-8 !text-xs"><Gem className="size-3.5" /> Redeem</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />Before launch, confirm the scheme terms (bonus, refunds on early exit, record-keeping) with the client's legal/finance team for UAE compliance.</p>
        </>
      )}

      <EnrolModal type={enrol} rate={book?.rate ?? 312} onClose={() => setEnrol(null)} onSaved={(ref) => { setEnrol(null); toast(`Plan ${ref} created`); setSrc("live"); load(); }} />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.customer.name ?? ""} subtitle={open ? `${TYPE[open.type].name} · ${open.reference}` : ""}
        footer={open && open.status === "ACTIVE" && (
          <div className="flex gap-2">
            {!open.matured && <button disabled={busy} onClick={() => pay(open)} className="btn-gold flex-1"><Wallet className="size-4" /> Record {aed(open.monthlyAmount)}</button>}
            {open.matured && <button disabled={busy} onClick={() => redeem(open)} className="btn-gold flex-1"><Gem className="size-4" /> Redeem against jewellery</button>}
          </div>
        )}>
        {open && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Paid", aed(open.paid)], ["Instalments", `${open.instalmentsPaid}/${open.tenureMonths}`], [open.type === "ACCUMULATION" ? "Gold" : "Bonus", open.type === "ACCUMULATION" ? `${open.grams} g` : aed(open.bonus)],
                ["Started", date(open.startDate)], ["Matures", date(open.maturityDate)], [open.type === "ACCUMULATION" ? "Avg rate" : "At maturity", open.type === "ACCUMULATION" ? (open.avgRate ? `${open.avgRate}/g` : "—") : aed(open.maturityValue ?? 0)]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted/50 p-2"><div className="text-[10.5px] text-muted-foreground">{k}</div><div className="font-semibold">{v}</div></div>
              ))}
            </div>
            <Dots paid={open.instalmentsPaid} total={open.tenureMonths} missed={open.missed} big />
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Payments</div>
              {open.payments.length === 0 ? <p className="text-muted-foreground">No payments yet.</p> : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {open.payments.map((x) => (
                    <div key={x.id} className="flex justify-between px-3 py-2 text-xs"><span>{date(x.paidAt)} · {x.method.toLowerCase()}</span><span className="tabular-nums">{aed(x.amount)} · {x.grams} g @ {x.goldRate}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function ProductCard({ type, icon: Icon, points, onEnrol, rate }: { type: PlanType; icon: typeof Coins; points: string[]; onEnrol: () => void; rate?: number }) {
  return (
    <div className="lux-card lux-sheen relative overflow-hidden p-5">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: TYPE[type].color }} />
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2 text-lg font-semibold"><Icon className="size-5 text-primary" /> Aurelia {TYPE[type].name}</div><div className="text-xs text-muted-foreground">{TYPE[type].short}{rate ? ` · today ${aed(rate)}/g (22K)` : ""}</div></div>
        <button onClick={onEnrol} className="btn-line !h-8 !text-xs"><Plus className="size-3.5" /> Enrol</button>
      </div>
      <ul className="mt-3 space-y-1.5 text-[13px]">{points.map((p) => <li key={p} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />{p}</li>)}</ul>
    </div>
  );
}

function Dots({ paid, total, missed, big }: { paid: number; total: number; missed: number; big?: boolean }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("rounded-full", big ? "h-2.5 flex-1" : "h-1.5 w-2.5", i < paid ? "bg-primary" : i < paid + missed ? "bg-warning" : "bg-border")} />
      ))}
    </div>
  );
}

function Kpi({ k, v, sub, warn }: { k: string; v: React.ReactNode; sub: string; warn?: boolean }) {
  return <div className="lux-card p-4"><div className="text-xs text-muted-foreground">{k}</div><div className={cn("mt-1 text-2xl font-semibold tabular-nums", warn && "text-warning")}>{v}</div><div className="mt-1 text-[11px] text-muted-foreground">{sub}</div></div>;
}

function EnrolModal({ type, rate, onClose, onSaved }: { type: PlanType | null; rate: number; onClose: () => void; onSaved: (ref: string) => void }) {
  const [t, setT] = useState<PlanType>("INSTALMENT");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [custId, setCustId] = useState("");
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("2000");
  const [nominee, setNominee] = useState("");
  const [firstPay, setFirstPay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!type) return;
    setT(type); setError(null); setCustId(""); setName(""); setPhone(""); setAmount("2000"); setNominee(""); setFirstPay(true);
    api.get<{ id: string; name: string; phone: string }[]>("/api/crm/sales/customers").then(setCustomers).catch(() => setCustomers([]));
  }, [type]);
  if (!type) return null;
  const amt = Number(amount) || 0;
  const bonus = Math.round(amt * 0.75);
  async function save() {
    if (amt < 250) { setError("Minimum AED 250 a month."); return; }
    if (mode === "existing" && !custId) { setError("Pick a client or switch to New client."); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ reference: string }>("/api/crm/gold-plans", {
        type: t, monthlyAmount: amt, tenureMonths: 11, karat: 22, nominee: nominee || undefined, firstPayment: firstPay, method: "CARD",
        ...(mode === "existing" ? { customerId: custId } : { name: name.trim(), phone: phone.trim() }),
      });
      onSaved(r.reference);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Enrol in a gold savings plan" wide>
      <div className="grid grid-cols-2 gap-2">
        {(["INSTALMENT", "ACCUMULATION"] as PlanType[]).map((x) => (
          <button key={x} onClick={() => setT(x)} className={cn("rounded-xl border p-3 text-left", t === x ? "border-primary bg-primary/10" : "border-border hover:bg-muted")}>
            <div className="font-medium">Aurelia {TYPE[x].name}</div><div className="text-xs text-muted-foreground">{TYPE[x].short}</div>
          </button>
        ))}
      </div>
      <div className="mt-4 mb-2 inline-flex rounded-lg border border-border p-0.5 text-xs">
        {(["existing", "new"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cn("rounded-md px-3 py-1.5", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{m === "existing" ? "Existing client" : "New client"}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "existing"
          ? <div className="sm:col-span-2"><Select value={custId} onChange={setCustId}><option value="">Select a client…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</Select></div>
          : <><Field label="Full name *"><Input value={name} onChange={setName} /></Field><Field label="Phone *"><Input value={phone} onChange={setPhone} type="tel" /></Field></>}
        <Field label="Monthly amount (AED)"><Input type="number" value={amount} onChange={setAmount} /></Field>
        <Field label="Nominee (optional)"><Input value={nominee} onChange={setNominee} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={firstPay} onChange={(e) => setFirstPay(e.target.checked)} className="accent-[#d4af6a]" /> Collect the first instalment now</label>
      <div className="mt-4 rounded-xl bg-muted/50 p-4 text-sm">
        {t === "INSTALMENT" ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-[11px] text-muted-foreground">Client pays (11 × {aed(amt)})</div><div className="text-lg font-semibold">{aed(amt * 11)}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Aurelia bonus</div><div className="text-lg font-semibold text-primary">+ {aed(bonus)}</div></div>
            <div><div className="text-[11px] text-muted-foreground">To spend at maturity</div><div className="text-lg font-semibold">{aed(amt * 11 + bonus)}</div></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-[11px] text-muted-foreground">Gold per month at today's rate</div><div className="text-lg font-semibold">{(amt / rate).toFixed(2)} g</div></div>
            <div><div className="text-[11px] text-muted-foreground">After 11 months (approx.)</div><div className="text-lg font-semibold">{((amt * 11) / rate).toFixed(1)} g</div></div>
            <div><div className="text-[11px] text-muted-foreground">Making charges on redemption</div><div className="text-lg font-semibold text-primary">50% off</div></div>
          </div>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Enrolling…" : "Enrol client"}</Button></div>
    </Modal>
  );
}
