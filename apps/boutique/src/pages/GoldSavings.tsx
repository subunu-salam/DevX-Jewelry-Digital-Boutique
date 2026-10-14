import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Check, Coins, Gift, Scale, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { aed } from "@/lib/format";
import { useStore } from "@/context/store";
import { ParticleField } from "@/design";

type PlanType = "INSTALMENT" | "ACCUMULATION";
interface MyPlan { id: string; reference: string; type: PlanType; status: string; monthlyAmount: number; tenureMonths: number; instalmentsPaid: number; paid: number; grams: number; currentValue: number; bonus: number; maturityDate: string; nextDue: string | null; matured: boolean }

const PLANS: Record<PlanType, { name: string; tag: string; icon: typeof Coins; points: string[] }> = {
  INSTALMENT: {
    name: "Golden Harvest", tag: "Save monthly · we add a bonus", icon: CalendarCheck,
    points: ["Pay a fixed amount every month for 11 months", "Aurelia adds 75% of one instalment as a bonus", "Spend the full value on any jewellery you love"],
  },
  ACCUMULATION: {
    name: "Gold Reserve", tag: "Build your gold, gram by gram", icon: Scale,
    points: ["Every payment buys 22K gold at that day's rate", "Your grams are protected if gold prices rise", "50% off making charges when you redeem"],
  },
};

export default function GoldSavings() {
  const { customer } = useStore();
  const [rate, setRate] = useState(312);
  const [type, setType] = useState<PlanType>("INSTALMENT");
  const [amount, setAmount] = useState(2000);
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyPlan[]>([]);

  useEffect(() => { api.get<{ rate: number }>("/api/public/gold-plans/rate").then((r) => setRate(r.rate)).catch(() => {}); }, []);
  useEffect(() => { if (customer) api.get<{ plans: MyPlan[] }>("/api/public/gold-plans/mine").then((r) => setMine(r.plans)).catch(() => {}); }, [customer]);

  const paid = amount * 11, bonus = Math.round(amount * 0.75), grams = paid / rate;
  async function join() {
    if (!customer && (name.trim().length < 2 || phone.replace(/\D/g, "").length < 6)) { setError("Please add your name and mobile number."); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ reference: string }>("/api/public/gold-plans/interest", { type, monthlyAmount: amount, ...(customer ? {} : { name: name.trim(), phone: phone.trim() }) });
      setSent(r.reference);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] bg-night px-6 py-12 text-on-night sm:px-12 sm:py-16">
        <ParticleField density={0.8} />
        <div className="relative max-w-xl">
          <span className="text-[11px] uppercase tracking-[0.3em] text-brand-soft">Aurelia Gold Savings</span>
          <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">Save a little each month. <em className="text-[#E9C98E]">Own something forever.</em></h1>
          <p className="mt-4 text-sm leading-6 text-on-night/75">Two simple plans that turn monthly savings into fine jewellery — with a bonus from us, or gold bought at today's rate. Today's 22K rate: <b className="text-on-night">{aed(rate)}/g</b>.</p>
        </div>
      </section>

      {/* Plans */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {(Object.keys(PLANS) as PlanType[]).map((k) => {
          const P = PLANS[k];
          return (
            <button key={k} onClick={() => setType(k)} className={cn("rounded-3xl border p-6 text-left transition", type === k ? "border-brand bg-surface shadow-lg" : "border-border bg-surface/60 hover:border-brand/50")}>
              <div className="flex items-center justify-between"><P.icon className="size-6 text-brand-deep" />{type === k && <span className="flex size-6 items-center justify-center rounded-full bg-brand text-white"><Check className="size-3.5" /></span>}</div>
              <h2 className="mt-4 font-serif text-2xl">Aurelia {P.name}</h2>
              <p className="text-sm text-muted-foreground">{P.tag}</p>
              <ul className="mt-4 space-y-2 text-sm">{P.points.map((p) => <li key={p} className="flex gap-2"><Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />{p}</li>)}</ul>
            </button>
          );
        })}
      </div>

      {/* Calculator + join */}
      <section className="mt-8 grid gap-6 rounded-3xl border border-border bg-surface p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <span className="eyebrow">Calculator</span>
          <h2 className="mt-1 font-serif text-3xl">How much would you like to save?</h2>
          <div className="mt-6 flex items-end justify-between"><span className="text-sm text-muted-foreground">Monthly amount</span><span className="font-serif text-3xl">{aed(amount)}</span></div>
          <input type="range" min={250} max={20000} step={250} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-3 w-full accent-[#A8874E]" aria-label="Monthly amount" />
          <div className="flex justify-between text-[11px] text-muted-foreground"><span>AED 250</span><span>AED 20,000</span></div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            {type === "INSTALMENT" ? (
              <>
                <Out k="You pay (11 months)" v={aed(paid)} />
                <Out k="Our bonus" v={`+ ${aed(bonus)}`} gold />
                <Out k="To spend on jewellery" v={aed(paid + bonus)} />
              </>
            ) : (
              <>
                <Out k="Gold each month" v={`${(amount / rate).toFixed(2)} g`} />
                <Out k="After 11 months" v={`≈ ${grams.toFixed(1)} g`} gold />
                <Out k="Making charges" v="50% off" />
              </>
            )}
          </div>
          <p className="mt-4 text-[11.5px] text-muted-foreground">{type === "ACCUMULATION" ? "Grams depend on the gold rate on each payment day; the figure above uses today's rate." : "Bonus is paid when you redeem your plan for jewellery at any Aurelia boutique."}</p>
        </div>

        <div className="rounded-2xl bg-sand p-6">
          {sent ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-brand text-white"><Check className="size-6" /></span>
              <h3 className="mt-4 font-serif text-2xl">You're on the list</h3>
              <p className="mt-2 text-sm text-muted-foreground">Our gold advisor will call you within one working day to set up your {PLANS[type].name} plan. Reference {sent}.</p>
            </div>
          ) : (
            <>
              <h3 className="font-serif text-2xl">Join {PLANS[type].name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{aed(amount)} a month · we'll call to complete enrolment — no payment taken online.</p>
              {!customer && (
                <div className="mt-4 space-y-3">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-brand" />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" type="tel" className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-brand" />
                </div>
              )}
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <button onClick={join} disabled={busy} className="mt-5 h-12 w-full rounded-full bg-ink text-sm font-semibold text-on-ink transition hover:opacity-90 disabled:opacity-50">{busy ? "Sending…" : "Request a call back"}</button>
              <ul className="mt-5 space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-brand-deep" />Every payment is receipted and visible in your account</li>
                <li className="flex gap-2"><Gift className="size-4 shrink-0 text-brand-deep" />Redeem at any boutique, for any piece</li>
              </ul>
            </>
          )}
        </div>
      </section>

      {customer && mine.length > 0 && (
        <section className="mt-8">
          <span className="eyebrow">Your plans</span>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {mine.map((p) => (
              <div key={p.id} className="rounded-3xl border border-border bg-surface p-6">
                <div className="flex items-center justify-between"><h3 className="font-serif text-xl">{PLANS[p.type].name}</h3><span className="text-xs text-muted-foreground">{p.reference}</span></div>
                <div className="mt-3 flex gap-1">{Array.from({ length: p.tenureMonths }, (_, i) => <span key={i} className={cn("h-2 flex-1 rounded-full", i < p.instalmentsPaid ? "bg-brand" : "bg-border")} />)}</div>
                <div className="mt-2 text-sm text-muted-foreground">{p.instalmentsPaid} of {p.tenureMonths} paid · {aed(p.paid)}{p.type === "ACCUMULATION" ? ` · ${p.grams} g` : ` · + ${aed(p.bonus)} bonus at maturity`}</div>
                <div className="mt-1 text-sm">{p.matured ? "Ready to redeem — visit any boutique ✨" : p.nextDue ? `Next instalment due ${new Date(p.nextDue).toLocaleDateString()}` : ""}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">Questions? <Link to="/appointments" className="underline">Book a visit</Link> and our advisor will walk you through the plans.</p>
    </div>
  );
}

function Out({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  return <div className="rounded-2xl bg-background p-3"><div className="text-[11px] text-muted-foreground">{k}</div><div className={cn("mt-1 font-serif text-xl", gold && "text-brand-deep")}>{v}</div></div>;
}
