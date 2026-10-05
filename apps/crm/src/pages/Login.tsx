import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Gem } from "lucide-react";
import { MetallicButton } from "@ui";
import { useAuth } from "@/context/auth";

const DEMO = [
  { role: "Owner", email: "owner@aurelia.ae" },
  { role: "Branch Manager", email: "manager@aurelia.ae" },
  { role: "Sales", email: "sales@aurelia.ae" },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("owner@aurelia.ae");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="relative flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground gold-glow"><Gem className="size-5" /></div>
          <span className="font-semibold">DevX Boutique OS</span>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-semibold leading-tight">The retail command centre for <span className="text-primary">fine jewellery.</span></h1>
          <p className="mt-4 max-w-md text-white/60">
            Inventory, branches, leads, quotes, invoices, gold intelligence and campaigns —
            one source of truth that also powers your customer boutique.
          </p>
        </div>
        <div className="relative text-xs text-white/40">AI-powered Jewellery Commerce &amp; Retail Intelligence Platform</div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Gem className="size-5" /></div>
              <span className="font-semibold">DevX Boutique OS</span>
            </div>
          </div>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Access the Aurelia Fine Jewellery workspace.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary" />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="pt-1">
              <MetallicButton label={busy ? "Signing in…" : "Sign in"} onClick={() => submit()} />
            </div>
          </form>

          <div className="mt-8 rounded-lg border border-border bg-muted/50 p-4">
            <div className="text-xs font-medium text-muted-foreground">Demo accounts · password <span className="font-semibold">Password123!</span></div>
            <div className="mt-2 space-y-1">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => { setEmail(d.email); setPassword("Password123!"); }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-card"
                >
                  <span className="font-medium">{d.role}</span>
                  <span className="text-muted-foreground">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
