import { useEffect, useState } from "react";
import { CalendarCheck, Check } from "lucide-react";
import { MetallicButton } from "@ui";
import { api } from "@/lib/api";
import { useStore } from "@/context/store";
import type { Branch, Storefront } from "@/lib/types";

const REASONS = ["Bridal consultation", "Private viewing", "Gold exchange / valuation", "Repair & service", "Gifting advice"];

export default function Appointments() {
  const { customer } = useStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", branchId: "", reason: REASONS[0], date: "", time: "11:00", notes: "" });
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Storefront>("/api/public/storefront").then((s) => {
      setBranches(s.branches);
      setForm((f) => ({ ...f, branchId: s.branches[0]?.id ?? "" }));
    }).catch(() => {});
  }, []);

  async function submit() {
    setError(null);
    if (!form.branchId || !form.date) { setError("Please choose a boutique and date."); return; }
    if (!customer && (!form.name || !form.phone)) { setError("Please add your name and phone."); return; }
    setSubmitting(true);
    try {
      const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString();
      const res = await api.post<{ reference: string }>("/api/public/appointments", {
        customer: customer ? undefined : { name: form.name, phone: form.phone, email: form.email || undefined },
        branchId: form.branchId,
        reason: form.reason,
        scheduledAt,
        notes: form.notes || undefined,
      });
      setReference(res.reference);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center lg:px-10">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-white">
          <CalendarCheck className="size-8" />
        </div>
        <h1 className="mt-6 font-serif text-4xl">Appointment requested</h1>
        <p className="mt-3 text-muted-foreground">
          Reference <span className="font-medium text-foreground">{reference}</span>. Our team will confirm your
          slot shortly. It's already on the boutique's calendar.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 lg:px-10">
      <span className="eyebrow">Visit Us</span>
      <h1 className="mt-2 font-serif text-4xl sm:text-5xl">Book a private viewing</h1>
      <p className="mt-3 max-w-lg text-muted-foreground">
        Reserve unhurried time with an advisor at the boutique of your choice.
      </p>

      <div className="mt-8 rounded-3xl border border-border bg-surface p-6 sm:p-8">
        {!customer && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Full name"><input className="ipt" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Phone"><input className="ipt" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email (optional)"><input className="ipt" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Boutique">
            <select className="ipt" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.city}</option>)}
            </select>
          </Field>
          <Field label="Reason">
            <select className="ipt" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Date"><input type="date" className="ipt" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Time"><input type="time" className="ipt" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
        </div>
        <div className="mt-4">
          <Field label="Notes (optional)">
            <textarea rows={3} className="ipt" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6">
          <MetallicButton label={submitting ? "Booking…" : "Book visit"} onClick={submit} />
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {branches.map((b) => (
          <div key={b.id} className="rounded-2xl border border-border bg-surface p-5">
            <div className="font-serif text-lg">{b.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">{b.address}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-deep"><Check className="size-3.5" /> {b.hours}</div>
          </div>
        ))}
      </div>
      <style>{`.ipt{width:100%;border:1px solid var(--color-border);background:var(--color-background);border-radius:.75rem;padding:.6rem .75rem;font-size:.875rem;outline:none}.ipt:focus{border-color:var(--color-brand)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
