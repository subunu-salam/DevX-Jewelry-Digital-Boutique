import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { date } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, EmptyState } from "@/components/ui";

interface Offer { id: string; title: string; description: string | null; image: string | null; discount: number; code: string | null; status: string; validUntil: string | null }

export default function Offers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", image: "", discount: "0", code: "", validUntil: "" });

  async function load() { setOffers(await api.get<Offer[]>("/api/crm/admin/offers")); }
  useEffect(() => { load().catch(() => {}); }, []);

  async function save() {
    await api.post("/api/crm/admin/offers", {
      title: f.title, description: f.description || undefined, image: f.image || undefined,
      discount: Number(f.discount), code: f.code || undefined, validUntil: f.validUntil || undefined, status: "ACTIVE",
    });
    setF({ title: "", description: "", image: "", discount: "0", code: "", validUntil: "" });
    setOpen(false); load();
  }
  async function setStatus(id: string, status: string) {
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    await api.patch(`/api/crm/admin/offers/${id}`, { status }).catch(() => load());
  }

  return (
    <div>
      <PageHeader title="Campaigns & Offers" subtitle="These power the boutique Offers page directly." action={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> New offer</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((o) => (
          <Card key={o.id} className="overflow-hidden">
            {o.image && <div className="aspect-[16/9] bg-muted"><img src={o.image} alt="" className="size-full object-cover" /></div>}
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{o.title}</h3>
                <Badge tone={o.status}>{o.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{o.code ?? "—"} · until {date(o.validUntil)}</span>
                <Select value={o.status} onChange={(v) => setStatus(o.id, v)} className="h-7 w-28 text-xs">
                  {["ACTIVE", "DRAFT", "EXPIRED"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </div>
            </div>
          </Card>
        ))}
        {offers.length === 0 && <div className="col-span-full"><EmptyState message="No campaigns yet." /></div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New offer">
        <div className="space-y-3">
          <Field label="Title"><Input value={f.title} onChange={(v) => setF({ ...f, title: v })} /></Field>
          <Field label="Description"><Input value={f.description} onChange={(v) => setF({ ...f, description: v })} /></Field>
          <Field label="Image URL"><Input value={f.image} onChange={(v) => setF({ ...f, image: v })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount %"><Input type="number" value={f.discount} onChange={(v) => setF({ ...f, discount: v })} /></Field>
            <Field label="Code"><Input value={f.code} onChange={(v) => setF({ ...f, code: v })} /></Field>
          </div>
          <Field label="Valid until"><Input type="date" value={f.validUntil} onChange={(v) => setF({ ...f, validUntil: v })} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={!f.title}>Publish</Button>
        </div>
      </Modal>
    </div>
  );
}
