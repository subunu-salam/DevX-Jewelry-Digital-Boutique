import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { aed } from "@/lib/format";
import { Button, Card, Field, Input, Modal, PageHeader, EmptyState } from "@/components/ui";

interface Supplier { id: string; name: string; contact: string | null; phone: string | null; categories: string[]; payable: number }

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", contact: "", phone: "", categories: "", payable: "0" });

  async function load() { setSuppliers(await api.get<Supplier[]>("/api/crm/admin/suppliers")); }
  useEffect(() => { load().catch(() => {}); }, []);

  async function save() {
    await api.post("/api/crm/admin/suppliers", {
      name: f.name, contact: f.contact || undefined, phone: f.phone || undefined,
      categories: f.categories ? f.categories.split(",").map((s) => s.trim()) : [], payable: Number(f.payable),
    });
    setF({ name: "", contact: "", phone: "", categories: "", payable: "0" });
    setOpen(false); load();
  }

  const totalPayable = suppliers.reduce((s, x) => s + x.payable, 0);

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Vendor master with payable tracking." action={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add supplier</Button>} />
      <div className="mb-5"><Card className="inline-block p-4"><div className="text-xs text-muted-foreground">Total payable</div><div className="mt-1 text-2xl font-semibold">{aed(totalPayable)}</div></Card></div>
      <Card>
        {suppliers.length === 0 ? <div className="p-6"><EmptyState message="No suppliers yet." /></div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Categories</th><th className="px-4 py-3 font-medium">Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.contact}{s.phone ? ` · ${s.phone}` : ""}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.categories.join(", ")}</td>
                  <td className="px-4 py-3 font-medium">{aed(s.payable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add supplier">
        <div className="space-y-3">
          <Field label="Name"><Input value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Field>
          <Field label="Contact person"><Input value={f.contact} onChange={(v) => setF({ ...f, contact: v })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(v) => setF({ ...f, phone: v })} /></Field>
          <Field label="Categories (comma separated)"><Input value={f.categories} onChange={(v) => setF({ ...f, categories: v })} placeholder="Gold, Diamond" /></Field>
          <Field label="Payable (AED)"><Input type="number" value={f.payable} onChange={(v) => setF({ ...f, payable: v })} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={!f.name}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
