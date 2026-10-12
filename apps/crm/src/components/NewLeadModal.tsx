import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Input, Modal, Select } from "@/components/ui";

const SOURCES = [
  ["walk_in", "Walk-in"], ["phone", "Phone call"], ["whatsapp", "WhatsApp"],
  ["instagram", "Instagram"], ["referral", "Referral"], ["boutique", "Website"],
] as const;
const OCCASIONS = ["", "Bridal", "Wedding", "Engagement", "Anniversary", "Birthday", "Gift", "Eid", "Diwali", "Everyday"];

export default function NewLeadModal({ open, onClose, onSaved, team }: {
  open: boolean; onClose: () => void; onSaved: (ref: string) => void; team: { id: string; name: string }[];
}) {
  const blank = { name: "", phone: "", email: "", source: "walk_in", status: "NEW", branchId: "", assignedToId: "", budget: "", occasion: "", piece: "", notes: "" };
  const [f, setF] = useState(blank);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof blank) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setF(blank); setError(null);
    api.get<{ id: string; name: string }[]>("/api/crm/admin/branches").then(setBranches).catch(() => setBranches([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    if (f.name.trim().length < 2 || f.phone.replace(/\D/g, "").length < 6) {
      setError("Please enter the customer's name and a valid phone number."); return;
    }
    setBusy(true); setError(null);
    try {
      const res = await api.post<{ reference: string }>("/api/crm/sales/inquiries", {
        name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() || undefined,
        source: f.source, status: f.status, branchId: f.branchId || undefined, assignedToId: f.assignedToId || undefined,
        budget: f.budget ? Number(f.budget) : undefined, occasion: f.occasion || undefined, notes: f.notes.trim() || undefined,
        items: f.piece.trim() ? f.piece.split(",").map((s) => ({ productName: s.trim(), quantity: 1 })).filter((x) => x.productName) : [],
      });
      onSaved(res.reference);
    } catch (e) {
      setError((e as Error).message || "Couldn't save the lead.");
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New lead">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer name *"><Input value={f.name} onChange={set("name")} placeholder="e.g. Fatima Al Mansoori" /></Field>
        <Field label="Phone / WhatsApp *"><Input value={f.phone} onChange={set("phone")} placeholder="+971 50 123 4567" type="tel" /></Field>
        <Field label="Email"><Input value={f.email} onChange={set("email")} placeholder="optional" type="email" /></Field>
        <Field label="Source"><Select value={f.source} onChange={set("source")}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Interested in"><Input value={f.piece} onChange={set("piece")} placeholder="e.g. Solitaire ring, gold bangle" /></Field>
        <Field label="Budget (AED)"><Input value={f.budget} onChange={set("budget")} placeholder="e.g. 15000" type="number" /></Field>
        <Field label="Occasion"><Select value={f.occasion} onChange={set("occasion")}>{OCCASIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}</Select></Field>
        <Field label="Stage"><Select value={f.status} onChange={set("status")}>
          <option value="NEW">New</option><option value="QUALIFIED">Qualified</option><option value="QUOTED">Quoted</option><option value="APPOINTMENT">Appointment</option>
        </Select></Field>
        <Field label="Boutique"><Select value={f.branchId} onChange={set("branchId")}><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label="Assign to"><Select value={f.assignedToId} onChange={set("assignedToId")}><option value="">Me</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      </div>
      <div className="mt-3"><Field label="Notes">
        <textarea value={f.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} placeholder="Ring size, preferences, follow-up time…"
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
      </Field></div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Create lead"}</Button>
      </div>
    </Modal>
  );
}
