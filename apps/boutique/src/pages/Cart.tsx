import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Trash2 } from "lucide-react";
import { MetallicButton } from "@ui";
import { api } from "@/lib/api";
import { useStore } from "@/context/store";
import type { Branch, Storefront } from "@/lib/types";

export default function Cart() {
  const { cart, removeFromCart, clearCart, customer } = useStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", branchId: "", occasion: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Storefront>("/api/public/storefront").then((s) => setBranches(s.branches)).catch(() => {});
  }, []);

  async function submit() {
    setError(null);
    if (!customer && (!form.name || !form.phone)) {
      setError("Please add your name and phone so an advisor can reach you.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ reference: string }>("/api/public/inquiries", {
        customer: customer ? undefined : { name: form.name, phone: form.phone, email: form.email || undefined },
        branchId: form.branchId || undefined,
        occasion: form.occasion || undefined,
        notes: form.notes || undefined,
        items: cart.map((l) => ({ productId: l.productId, productName: l.name, quantity: l.quantity })),
      });
      setReference(res.reference);
      clearCart();
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
          <Check className="size-8" />
        </div>
        <h1 className="mt-6 font-serif text-4xl">Inquiry received</h1>
        <p className="mt-3 text-muted-foreground">
          Your reference is <span className="font-medium text-foreground">{reference}</span>. An Aurelia advisor will
          be in touch shortly — and your inquiry is already in our team's pipeline.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link to="/catalog" className="rounded-full border border-border px-6 py-3 text-sm hover:border-brand">Continue browsing</Link>
          <Link to="/appointments" className="rounded-full bg-foreground px-6 py-3 text-sm text-background">Book a viewing</Link>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center lg:px-10">
        <h1 className="font-serif text-4xl">Your inquiry bag is empty</h1>
        <p className="mt-3 text-muted-foreground">Add pieces you'd like to enquire about and send them to an advisor in one step.</p>
        <Link to="/catalog" className="mt-8 inline-block rounded-full bg-foreground px-6 py-3 text-sm text-background">Explore the collection</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
      <h1 className="font-serif text-4xl sm:text-5xl">Your Inquiry</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        High-value jewellery is reserved through a personal advisor rather than instant checkout.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        {/* Lines */}
        <div className="space-y-4">
          {cart.map((l) => (
            <div key={l.productId} className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3">
              <div className="h-20 w-20 overflow-hidden rounded-xl bg-champagne">
                {l.image && <img src={l.image} alt={l.name} className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1">
                <div className="font-serif text-lg">{l.name}</div>
                <div className="text-sm text-muted-foreground">Qty {l.quantity}</div>
              </div>
              <button onClick={() => removeFromCart(l.productId)} className="rounded-full p-2 text-muted-foreground hover:text-red-600" aria-label="Remove">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h3 className="font-serif text-xl">Send to an advisor</h3>
          {customer ? (
            <p className="mt-2 text-sm text-muted-foreground">Signed in as {customer.name} ({customer.phone})</p>
          ) : (
            <div className="mt-4 space-y-3">
              <Input placeholder="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Input placeholder="Phone (e.g. +9715…)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <Input placeholder="Email (optional)" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            </div>
          )}
          <div className="mt-3 space-y-3">
            <select
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
            >
              <option value="">Preferred boutique (optional)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <Input placeholder="Occasion (optional)" value={form.occasion} onChange={(v) => setForm({ ...form, occasion: v })} />
            <textarea
              placeholder="Notes — size, budget, timeline…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-5">
            <MetallicButton label={submitting ? "Sending…" : "Send inquiry"} onClick={submit} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
    />
  );
}
