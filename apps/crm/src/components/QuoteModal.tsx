import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { aed } from "@/lib/format";
import { Button, Field, Input, Modal } from "@/components/ui";

interface Line { description: string; metalValue: string; makingValue: string; stoneValue: string; quantity: string }

export default function QuoteModal({
  open, onClose, onSaved, inquiryId, customerId, branchId, seedItems,
}: {
  open: boolean; onClose: () => void; onSaved: (shareToken?: string) => void;
  inquiryId?: string; customerId?: string; branchId?: string; seedItems?: string[];
}) {
  const [lines, setLines] = useState<Line[]>(
    (seedItems && seedItems.length ? seedItems : ["Item"]).map((d) => ({
      description: d, metalValue: "0", makingValue: "0", stoneValue: "0", quantity: "1",
    })),
  );
  const [taxRate, setTaxRate] = useState("5");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = lines.reduce((s, l) => s + (Number(l.metalValue) + Number(l.makingValue) + Number(l.stoneValue)) * Number(l.quantity), 0);
  const afterDiscount = subtotal - Number(discount);
  const tax = afterDiscount * (Number(taxRate) / 100);
  const total = afterDiscount + tax;

  function update(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ shareToken: string }>("/api/crm/sales/quotes", {
        inquiryId, customerId, branchId, taxRate: Number(taxRate), discount: Number(discount), notes: notes || undefined,
        items: lines.map((l) => ({
          description: l.description, metalValue: Number(l.metalValue), makingValue: Number(l.makingValue),
          stoneValue: Number(l.stoneValue), quantity: Number(l.quantity),
        })),
      });
      onSaved(res.shareToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create quotation" wide>
      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-4"><Field label={i === 0 ? "Description" : ""}><Input value={l.description} onChange={(v) => update(i, { description: v })} /></Field></div>
            <div className="col-span-2"><Field label={i === 0 ? "Metal" : ""}><Input type="number" value={l.metalValue} onChange={(v) => update(i, { metalValue: v })} /></Field></div>
            <div className="col-span-2"><Field label={i === 0 ? "Making" : ""}><Input type="number" value={l.makingValue} onChange={(v) => update(i, { makingValue: v })} /></Field></div>
            <div className="col-span-2"><Field label={i === 0 ? "Stones" : ""}><Input type="number" value={l.stoneValue} onChange={(v) => update(i, { stoneValue: v })} /></Field></div>
            <div className="col-span-1"><Field label={i === 0 ? "Qty" : ""}><Input type="number" value={l.quantity} onChange={(v) => update(i, { quantity: v })} /></Field></div>
            <div className="col-span-1">
              <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="mb-0.5 flex size-9 items-center justify-center rounded-lg border border-border hover:bg-muted">
                <Trash2 className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, { description: "Item", metalValue: "0", makingValue: "0", stoneValue: "0", quantity: "1" }])}>
          <Plus className="size-3.5" /> Add line
        </Button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Field label="Discount (AED)"><Input type="number" value={discount} onChange={setDiscount} /></Field>
        <Field label="VAT %"><Input type="number" value={taxRate} onChange={setTaxRate} /></Field>
        <Field label="Notes"><Input value={notes} onChange={setNotes} /></Field>
      </div>

      <div className="mt-5 rounded-lg bg-muted/60 p-4 text-sm">
        <Row label="Subtotal" value={aed(subtotal)} />
        <Row label={`Discount`} value={`− ${aed(Number(discount))}`} />
        <Row label={`VAT (${taxRate}%)`} value={aed(tax)} />
        <div className="mt-2 border-t border-border pt-2"><Row label="Total" value={aed(total)} bold /></div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Creating…" : "Create quotation"}</Button>
      </div>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className={bold ? "text-foreground" : ""}>{value}</span>
    </div>
  );
}
