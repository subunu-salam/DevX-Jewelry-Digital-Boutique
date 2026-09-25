import { useEffect, useState } from "react";
import { Plus, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, Field, Input, Modal, PageHeader } from "@/components/ui";

interface Branch {
  id: string; name: string; city: string; address: string | null; phone: string | null; hours: string | null;
  _count: { users: number; inquiries: number; appointments: number };
}

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", city: "", address: "", phone: "", hours: "10:00 – 22:00" });

  async function load() { setBranches(await api.get<Branch[]>("/api/crm/admin/branches")); }
  useEffect(() => { load().catch(() => {}); }, []);

  async function save() {
    await api.post("/api/crm/admin/branches", f);
    setF({ name: "", city: "", address: "", phone: "", hours: "10:00 – 22:00" });
    setOpen(false); load();
  }

  return (
    <div>
      <PageHeader title="Branches" subtitle="Boutiques, working hours and per-branch activity." action={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add branch</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((b) => (
          <Card key={b.id} className="p-5">
            <div className="flex items-center gap-2 text-primary"><MapPin className="size-4" /><span className="font-semibold text-foreground">{b.name}</span></div>
            <div className="mt-1 text-sm text-muted-foreground">{b.address ?? b.city}</div>
            <div className="mt-1 text-xs text-muted-foreground">{b.phone} · {b.hours}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-xs">
              <div><div className="text-lg font-semibold">{b._count.users}</div><div className="text-muted-foreground">Staff</div></div>
              <div><div className="text-lg font-semibold">{b._count.inquiries}</div><div className="text-muted-foreground">Leads</div></div>
              <div><div className="text-lg font-semibold">{b._count.appointments}</div><div className="text-muted-foreground">Visits</div></div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add branch">
        <div className="space-y-3">
          <Field label="Name"><Input value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Field>
          <Field label="City"><Input value={f.city} onChange={(v) => setF({ ...f, city: v })} /></Field>
          <Field label="Address"><Input value={f.address} onChange={(v) => setF({ ...f, address: v })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input value={f.phone} onChange={(v) => setF({ ...f, phone: v })} /></Field>
            <Field label="Hours"><Input value={f.hours} onChange={(v) => setF({ ...f, hours: v })} /></Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={!f.name || !f.city}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
