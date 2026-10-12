import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Input, Modal, Select } from "@/components/ui";

export interface SchedulePrefill { inquiryId?: string; name?: string; phone?: string | null; branchName?: string | null; reason?: string }

const REASONS = ["Showroom visit", "Bridal consultation", "Custom design", "Ring sizing", "Repair / cleaning", "Collection & handover", "Video call"];
const SLOTS = Array.from({ length: 21 }, (_, i) => { const m = 10 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 ? "30" : "00"}`; }); // 10:00–20:00

function tomorrow() { const d = new Date(Date.now() + 864e5); return d.toISOString().slice(0, 10); }

export default function ScheduleModal({ open, onClose, onSaved, prefill }: {
  open: boolean; onClose: () => void; onSaved: (ref: string) => void; prefill?: SchedulePrefill | null;
}) {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ name: "", phone: "", branchId: "", staffId: "", reason: REASONS[0], date: tomorrow(), time: "11:00", status: "CONFIRMED", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const fromLead = !!prefill?.inquiryId;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setF({ name: prefill?.name ?? "", phone: prefill?.phone ?? "", branchId: "", staffId: "", reason: prefill?.reason ?? REASONS[0], date: tomorrow(), time: "11:00", status: "CONFIRMED", notes: "" });
    api.get<{ id: string; name: string }[]>("/api/crm/admin/branches").then((b) => {
      setBranches(b);
      const match = b.find((x) => x.name === prefill?.branchName) ?? b[0];
      if (match) setF((p) => ({ ...p, branchId: p.branchId || match.id }));
    }).catch(() => setBranches([]));
    api.get<{ id: string; name: string }[]>("/api/crm/admin/users").then((u) => setTeam(u.map((x) => ({ id: x.id, name: x.name })))).catch(() => setTeam([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    const when = new Date(`${f.date}T${f.time}:00`);
    if (!f.branchId) return setError("Please pick a boutique.");
    if (Number.isNaN(when.getTime())) return setError("Please pick a valid date and time.");
    if (when.getTime() < Date.now() - 5 * 60e3) return setError("That time is in the past.");
    if (!fromLead && (f.name.trim().length < 2 || f.phone.replace(/\D/g, "").length < 6)) return setError("Please enter the customer's name and phone number.");
    setBusy(true); setError(null);
    try {
      const res = await api.post<{ reference: string }>("/api/crm/sales/appointments", {
        inquiryId: prefill?.inquiryId, name: f.name.trim() || undefined, phone: f.phone.trim() || undefined,
        branchId: f.branchId, staffId: f.staffId || undefined, reason: f.reason,
        scheduledAt: when.toISOString(), status: f.status, notes: f.notes.trim() || undefined,
      });
      onSaved(res.reference);
    } catch (e) { setError((e as Error).message || "Couldn't book the appointment."); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={fromLead ? `Book appointment · ${prefill?.name ?? ""}` : "Schedule appointment"}>
      <div className="grid gap-3 sm:grid-cols-2">
        {!fromLead && <>
          <Field label="Customer name *"><Input value={f.name} onChange={set("name")} placeholder="e.g. Aisha Al Mansoori" /></Field>
          <Field label="Phone / WhatsApp *"><Input value={f.phone} onChange={set("phone")} placeholder="+971 50 123 4567" type="tel" /></Field>
        </>}
        <Field label="Date *"><Input value={f.date} onChange={set("date")} type="date" /></Field>
        <Field label="Time *"><Select value={f.time} onChange={set("time")}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Boutique *"><Select value={f.branchId} onChange={set("branchId")}>{branches.length === 0 && <option value="">—</option>}{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label="Advisor"><Select value={f.staffId} onChange={set("staffId")}><option value="">Me</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Purpose"><Select value={f.reason} onChange={set("reason")}>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}><option value="CONFIRMED">Confirmed</option><option value="REQUESTED">Tentative</option></Select></Field>
      </div>
      <div className="mt-3"><Field label="Notes">
        <textarea value={f.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} placeholder="Pieces to prepare, ring size, guests…"
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
      </Field></div>
      {fromLead && <p className="mt-2 text-xs text-muted-foreground">The lead moves to the Appointment stage once booked.</p>}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Booking…" : "Book appointment"}</Button>
      </div>
    </Modal>
  );
}
