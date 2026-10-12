import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, Package, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { aed } from "@/lib/format";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { DocPaper, type DocData } from "@/components/DocPreview";

interface Line { productId?: string; sku?: string; description: string; metalValue: string; makingValue: string; stoneValue: string; quantity: string; stock?: number }
interface Product { id: string; sku: string; name: string; basePrice: number; priceMode: string; karat: number; metal: string; category: string | null; image: string | null; active: boolean; totalStock: number }
interface Customer { id: string; name: string; phone: string; email: string | null }

const blankLine = (description = ""): Line => ({ description, metalValue: "0", makingValue: "0", stoneValue: "0", quantity: "1" });

export default function QuoteModal({
  open, onClose, onSaved, inquiryId, customerId, branchId, seedItems, customerName,
}: {
  open: boolean; onClose: () => void; onSaved: (shareToken?: string) => void;
  inquiryId?: string; customerId?: string; branchId?: string; seedItems?: string[]; customerName?: string;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [pq, setPq] = useState("");
  const [custMode, setCustMode] = useState<"existing" | "new">("existing");
  const [custId, setCustId] = useState(customerId ?? "");
  const [newCust, setNewCust] = useState({ name: "", phone: "", email: "" });
  const [taxRate, setTaxRate] = useState("5");
  const [discount, setDiscount] = useState("0");
  const [validDays, setValidDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = !!inquiryId || !!customerId;

  useEffect(() => {
    if (!open) return;
    api.get<Product[]>("/api/crm/products").then((ps) => {
      const live = ps.filter((p) => p.active);
      setProducts(live);
      // Lead items → match to inventory where the names line up.
      const seeds = seedItems?.length ? seedItems : [];
      setLines(seeds.length ? seeds.map((name) => {
        const m = live.find((p) => p.name.toLowerCase() === name.toLowerCase());
        return m ? fromProduct(m) : blankLine(name);
      }) : []);
    }).catch(() => { setProducts([]); setLines((seedItems ?? []).map((s) => blankLine(s))); });
    if (!linked) api.get<Customer[]>("/api/crm/sales/customers").then(setCustomers).catch(() => setCustomers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matches = useMemo(() => {
    const t = pq.trim().toLowerCase();
    if (!t) return products.slice(0, 6);
    return products.filter((p) => [p.name, p.sku, p.category ?? "", p.metal].join(" ").toLowerCase().includes(t)).slice(0, 8);
  }, [pq, products]);

  const lineTotal = (l: Line) => (Number(l.metalValue) + Number(l.makingValue) + Number(l.stoneValue)) * Number(l.quantity);
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const afterDiscount = Math.max(0, subtotal - Number(discount));
  const tax = afterDiscount * (Number(taxRate) / 100);
  const total = afterDiscount + tax;
  const validUntil = new Date(Date.now() + Number(validDays || 0) * 864e5).toISOString();

  function update(i: number, patch: Partial<Line>) { setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l))); }
  function addProduct(p: Product) {
    setLines((prev) => {
      const at = prev.findIndex((l) => l.productId === p.id);
      if (at >= 0) return prev.map((l, i) => (i === at ? { ...l, quantity: String(Number(l.quantity) + 1) } : l));
      return [...prev, fromProduct(p)];
    });
    setPq("");
  }

  const selectedCustomer = customers.find((c) => c.id === custId);
  const doc: DocData = {
    kind: "Quotation", reference: "DRAFT", validUntil,
    customer: linked ? { name: customerName ?? "Lead customer" } : custMode === "new" ? newCust : selectedCustomer ?? null,
    lines: lines.map((l) => {
      const unit = Number(l.metalValue) + Number(l.makingValue) + Number(l.stoneValue);
      return { description: l.description || "Item", quantity: Number(l.quantity), unitPrice: unit, lineTotal: lineTotal(l), detail: l.sku ? `SKU ${l.sku}` : undefined };
    }),
    subtotal, discount: Number(discount), taxRate: Number(taxRate), taxTotal: tax, total, notes,
  };

  function validate(): string | null {
    if (!lines.length) return "Add at least one piece from inventory or a custom line.";
    if (lines.some((l) => !l.description.trim())) return "Every line needs a description.";
    if (lines.some((l) => Number(l.quantity) < 1)) return "Quantity must be at least 1.";
    if (!linked) {
      if (custMode === "existing" && !custId) return "Pick a customer, or switch to New customer.";
      if (custMode === "new" && (newCust.name.trim().length < 2 || newCust.phone.replace(/\D/g, "").length < 6)) return "Enter the new customer's name and phone.";
    }
    return null;
  }

  async function save() {
    const v = validate(); if (v) { setError(v); return; }
    setError(null); setBusy(true);
    try {
      const res = await api.post<{ shareToken: string }>("/api/crm/sales/quotes", {
        inquiryId, branchId, taxRate: Number(taxRate), discount: Number(discount), notes: notes || undefined, validUntil,
        customerId: linked ? customerId : custMode === "existing" ? custId : undefined,
        customer: !linked && custMode === "new" ? { name: newCust.name.trim(), phone: newCust.phone.trim(), email: newCust.email.trim() } : undefined,
        items: lines.map((l) => ({
          productId: l.productId, description: l.description.trim(), metalValue: Number(l.metalValue), makingValue: Number(l.makingValue),
          stoneValue: Number(l.stoneValue), quantity: Number(l.quantity),
        })),
      });
      onSaved(res.shareToken);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (preview) {
    return (
      <Modal open={open} onClose={onClose} title="Preview quotation" wide>
        <div className="-m-5 bg-[#0c0d10] p-5"><DocPaper d={doc} /></div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-between gap-2">
          <Button variant="outline" onClick={() => setPreview(false)}><ArrowLeft className="size-4" /> Back to edit</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Creating…" : "Create quotation"}</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Create quotation" wide>
      {/* Customer */}
      <section className="mb-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</div>
        {linked ? (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{customerName ?? "Linked to this lead"}</div>
        ) : (
          <>
            <div className="mb-2 inline-flex rounded-lg border border-border p-0.5 text-xs">
              {(["existing", "new"] as const).map((m) => (
                <button key={m} onClick={() => setCustMode(m)} className={`rounded-md px-3 py-1.5 ${custMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{m === "existing" ? "Existing customer" : "New customer"}</button>
              ))}
            </div>
            {custMode === "existing" ? (
              <Select value={custId} onChange={setCustId}>
                <option value="">Select a customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
              </Select>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                <Input value={newCust.name} onChange={(v) => setNewCust((p) => ({ ...p, name: v }))} placeholder="Full name *" />
                <Input value={newCust.phone} onChange={(v) => setNewCust((p) => ({ ...p, phone: v }))} placeholder="Phone *" type="tel" />
                <Input value={newCust.email} onChange={(v) => setNewCust((p) => ({ ...p, email: v }))} placeholder="Email" type="email" />
              </div>
            )}
          </>
        )}
      </section>

      {/* Inventory picker */}
      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add from inventory</div>
          <span className="text-xs text-muted-foreground">{products.length} pieces</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Search by name, SKU, category or metal…"
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {matches.map((p) => (
            <button key={p.id} onClick={() => addProduct(p)} className="card-lift flex items-center gap-3 rounded-lg border border-border bg-card p-2 text-left hover:border-primary/60">
              <div className="size-11 shrink-0 overflow-hidden rounded-md bg-muted">{p.image ? <img src={p.image} alt="" className="size-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <Package className="m-3 size-5 text-muted-foreground" />}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{p.sku} · {p.karat}K {p.metal} · {p.totalStock > 0 ? `${p.totalStock} in stock` : <span className="text-warning">out of stock</span>}</div>
              </div>
              <div className="text-right text-xs"><div className="font-medium">{p.basePrice ? aed(p.basePrice) : "On request"}</div><Plus className="ml-auto mt-0.5 size-3.5 text-primary" /></div>
            </button>
          ))}
          {matches.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">No pieces match “{pq}”. Add a custom line below.</div>}
        </div>
      </section>

      {/* Lines */}
      <section className="space-y-2">
        {lines.length > 0 && (
          <div className="hidden grid-cols-12 gap-2 px-1 text-[11px] uppercase tracking-wide text-muted-foreground sm:grid">
            <div className="col-span-4">Item</div><div className="col-span-2">Metal / price</div><div className="col-span-2">Making</div><div className="col-span-2">Stones</div><div className="col-span-1">Qty</div><div />
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-12 sm:col-span-4">
              <Input value={l.description} onChange={(v) => update(i, { description: v })} placeholder="Description" />
              {l.sku && <div className="mt-0.5 text-[10px] text-primary">From inventory · {l.sku}{l.stock !== undefined && ` · ${l.stock} in stock`}</div>}
            </div>
            <div className="col-span-3 sm:col-span-2"><Input type="number" value={l.metalValue} onChange={(v) => update(i, { metalValue: v })} /></div>
            <div className="col-span-3 sm:col-span-2"><Input type="number" value={l.makingValue} onChange={(v) => update(i, { makingValue: v })} /></div>
            <div className="col-span-3 sm:col-span-2"><Input type="number" value={l.stoneValue} onChange={(v) => update(i, { stoneValue: v })} /></div>
            <div className="col-span-2 sm:col-span-1"><Input type="number" value={l.quantity} onChange={(v) => update(i, { quantity: v })} /></div>
            <div className="col-span-1">
              <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="flex size-9 items-center justify-center rounded-lg border border-border hover:bg-muted" aria-label="Remove line">
                <Trash2 className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setLines((p) => [...p, blankLine()])}><Plus className="size-3.5" /> Custom line (made-to-order, repair…)</Button>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Field label="Discount (AED)"><Input type="number" value={discount} onChange={setDiscount} /></Field>
        <Field label="VAT %"><Input type="number" value={taxRate} onChange={setTaxRate} /></Field>
        <Field label="Valid for (days)"><Input type="number" value={validDays} onChange={setValidDays} /></Field>
        <Field label="Notes"><Input value={notes} onChange={setNotes} placeholder="Shown on the quote" /></Field>
      </div>

      <div className="mt-5 rounded-lg bg-muted/60 p-4 text-sm">
        <Row label="Subtotal" value={aed(subtotal)} />
        <Row label="Discount" value={`− ${aed(Number(discount))}`} />
        <Row label={`VAT (${taxRate}%)`} value={aed(tax)} />
        <div className="mt-2 border-t border-border pt-2"><Row label="Total" value={aed(total)} bold /></div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="outline" onClick={() => { const v = validate(); setError(v); if (!v) setPreview(true); }}><Eye className="size-4" /> Preview</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Creating…" : "Create quotation"}</Button>
      </div>
    </Modal>
  );
}

function fromProduct(p: Product): Line {
  return { productId: p.id, sku: p.sku, description: `${p.name} (${p.karat}K ${p.metal})`, metalValue: String(p.basePrice || 0), makingValue: "0", stoneValue: "0", quantity: "1", stock: p.totalStock };
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className={bold ? "text-foreground" : ""}>{value}</span>
    </div>
  );
}
