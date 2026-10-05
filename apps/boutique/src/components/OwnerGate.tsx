import { useState } from "react";
import { Lock } from "lucide-react";
import { ownerLogin, ownerToken } from "@/lib/owner";

/** Gates a staff/owner-only screen behind a quick sign-in (uses the CRM staff login). */
export default function OwnerGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(!!ownerToken());
  const [email, setEmail] = useState("owner@aurelia.ae");
  const [password, setPassword] = useState("Password123!");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authed) return <>{children}</>;

  async function submit() {
    setBusy(true); setError(null);
    try { await ownerLogin(email, password); setAuthed(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-2 flex items-center gap-2 text-brand-deep">
          <Lock className="size-4" /> <span className="text-sm font-medium">Owner / staff sign-in</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">This tool writes to the CRM, so it needs a staff account.</p>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand" />
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand" />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button onClick={submit} disabled={busy} className="mt-4 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">Demo: owner@aurelia.ae · Password123!</p>
      </div>
    </div>
  );
}
