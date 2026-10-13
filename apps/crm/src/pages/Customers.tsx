import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { date } from "@/lib/format";
import { FileText, Search, UserPlus } from "lucide-react";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, EmptyState, Select } from "@/components/ui";
import QuoteModal from "@/components/QuoteModal";
import { useToast } from "@/components/lux";

interface Customer {
  id: string; name: string; phone: string; email: string | null; segment: string;
  marketingConsent: boolean; inquiries: number; appointments: number; invoices: number;
  hasAccount: boolean; createdAt: string;
}
const SEGMENT_LABEL: Record<string, string> = { new: "New", repeat: "Repeat", high_value: "High value", inactive: "Inactive" };

export default function Customers() {
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [adding, setAdding] = useState(false);
  const [quoteFor, setQuoteFor] = useState<Customer | null>(null);
  const [q, setQ] = useState("");
  const load = () => api.get<Customer[]>("/api/crm/sales/customers").then(setCustomers).catch(() => {});
  const [tiers, setTiers] = useState<Record<string, { tier: string; risk: string }>>({});
  useEffect(() => {
    load();
    api.get<{ source: string; clients: { id: string; tier: string; risk: string }[] }>("/api/crm/retention?source=live")
      .then((r) => setTiers(Object.fromEntries(r.clients.map((c) => [c.id, { tier: c.tier, risk: c.risk }])))).catch(() => {});
  }, []);
  const shown = customers.filter((c) => !q || `${c.name} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Boutique accounts, inquiry-captured and manually added contacts, with consent state."
        action={<Button onClick={() => setAdding(true)}><UserPlus className="size-4" /> Add customer</Button>}
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email" className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary" />
      </div>
      <Card>
        {customers.length === 0 ? <div className="p-6"><EmptyState message="No customers yet — use Add customer to create one." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Segment</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Consent</th>
                  <th className="px-4 py-3 font-medium">Since</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{c.name.charAt(0)}</div>
                        <div>
                          <div className="font-medium">{c.name} {c.hasAccount && <span className="ml-1 text-[10px] text-primary">● account</span>}
                            {tiers[c.id] && <span className="ml-1.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">{tiers[c.id].tier}</span>}
                            {tiers[c.id] && (tiers[c.id].risk === "At risk" || tiers[c.id].risk === "Lapsed") && <span className="ml-1 rounded-full bg-warning-bg px-1.5 py-px text-[10px] text-warning">{tiers[c.id].risk}</span>}</div>
                          <div className="text-xs text-muted-foreground">{c.phone}{c.email ? ` · ${c.email}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge>{SEGMENT_LABEL[c.segment] ?? c.segment}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.inquiries} inquiries · {c.appointments} visits · {c.invoices} invoices</td>
                    <td className="px-4 py-3">{c.marketingConsent ? <Badge tone="ACTIVE">Opted in</Badge> : <Badge>No consent</Badge>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{date(c.createdAt)}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setQuoteFor(c)}><FileText className="size-3.5" /> Quote</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddCustomerModal open={adding} onClose={() => setAdding(false)} onSaved={(name) => { setAdding(false); toast(`${name} added`); load(); }} />
      {quoteFor && (
        <QuoteModal open customerId={quoteFor.id} customerName={quoteFor.name} onClose={() => setQuoteFor(null)}
          onSaved={() => { setQuoteFor(null); toast("Quotation created — see Quotations"); load(); }} />
      )}
    </div>
  );
}

function AddCustomerModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (name: string) => void }) {
  const blank = { name: "", phone: "", email: "", segment: "new", consent: "no", notes: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setF(blank); setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof blank) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (f.name.trim().length < 2 || f.phone.replace(/\D/g, "").length < 6) { setError("Please enter a name and a valid phone number."); return; }
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) { setError("That email doesn't look right."); return; }
    setBusy(true); setError(null);
    try {
      const res = await api.post<{ name: string }>("/api/crm/sales/customers", {
        name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() || undefined, segment: f.segment, marketingConsent: f.consent === "yes", notes: f.notes.trim() || undefined,
      });
      onSaved(res.name);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add customer">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name *"><Input value={f.name} onChange={set("name")} placeholder="e.g. Mariam Al Hashimi" /></Field>
        <Field label="Phone / WhatsApp *"><Input value={f.phone} onChange={set("phone")} placeholder="+971 50 123 4567" type="tel" /></Field>
        <Field label="Email"><Input value={f.email} onChange={set("email")} placeholder="optional" type="email" /></Field>
        <Field label="Segment"><Select value={f.segment} onChange={set("segment")}>
          <option value="new">New</option><option value="repeat">Repeat</option><option value="high_value">High value</option><option value="inactive">Inactive</option>
        </Select></Field>
        <Field label="Marketing consent"><Select value={f.consent} onChange={set("consent")}><option value="no">No consent</option><option value="yes">Opted in</option></Select></Field>
        <Field label="Notes"><Input value={f.notes} onChange={set("notes")} placeholder="Ring size, preferences…" /></Field>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Add customer"}</Button>
      </div>
    </Modal>
  );
}
