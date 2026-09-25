import { useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, User } from "lucide-react";
import { MetallicButton } from "@ui";
import { useStore } from "@/context/store";

export default function Account() {
  const { customer, login, register, logout, saved } = useStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", consent: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(form.phone, form.password);
      else await register({ name: form.name, phone: form.phone, email: form.email || undefined, password: form.password, marketingConsent: form.consent });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (customer) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 lg:px-10">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-brand text-white">
            <User className="size-6" />
          </div>
          <div>
            <h1 className="font-serif text-3xl">{customer.name}</h1>
            <p className="text-sm text-muted-foreground">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</p>
          </div>
          <button onClick={logout} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:border-brand">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Stat label="Saved pieces" value={saved.length} />
          <Stat label="Marketing" value={customer.marketingConsent ? "Opted in" : "Off"} />
          <Stat label="Member" value="Aurelia" />
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
          Your inquiries, quotations and appointments appear here as your advisor updates them.
          <div className="mt-4">
            <Link to="/catalog" className="text-brand">Continue browsing the collection →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 lg:px-10">
      <h1 className="text-center font-serif text-4xl">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Save pieces, follow the gold rate, and keep your inquiries in one place.
      </p>

      <div className="mt-8 space-y-3 rounded-3xl border border-border bg-surface p-6">
        {mode === "register" && (
          <input className="ipt" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        )}
        <input className="ipt" placeholder="Phone (e.g. +9715…)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        {mode === "register" && (
          <input className="ipt" placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        )}
        <input className="ipt" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {mode === "register" && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
            Keep me informed about new arrivals & offers
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="pt-2">
          <MetallicButton label={busy ? "Please…" : mode === "login" ? "Sign in" : "Register"} onClick={submit} />
        </div>
        <button
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
          className="w-full pt-1 text-center text-sm text-foreground/70 hover:text-brand"
        >
          {mode === "login" ? "New to Aurelia? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Demo customer login — phone <span className="font-medium">+971501112233</span> · password <span className="font-medium">Customer123!</span>
      </p>
      <style>{`.ipt{width:100%;border:1px solid var(--color-border);background:var(--color-background);border-radius:.75rem;padding:.65rem .8rem;font-size:.9rem;outline:none}.ipt:focus{border-color:var(--color-brand)}`}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 text-center">
      <div className="font-serif text-2xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
