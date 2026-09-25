import { useEffect, useState } from "react";
import { Plus, Package, Star } from "lucide-react";
import { api } from "@/lib/api";
import { aed } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select } from "@/components/ui";

interface ProductRow {
  id: string; sku: string; name: string; priceMode: string; basePrice: number;
  metal: string; karat: number; category: string | null; collection: string | null;
  image: string | null; featured: boolean; isNew: boolean; active: boolean; totalStock: number;
  inventory: { branchId: string; branchName: string; quantity: number }[];
}
interface Ref { id: string; name: string }

export default function Catalog() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [collections, setCollections] = useState<Ref[]>([]);
  const [branches, setBranches] = useState<Ref[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [p, c, col, b] = await Promise.all([
      api.get<ProductRow[]>("/api/crm/products"),
      api.get<Ref[]>("/api/crm/admin/categories"),
      api.get<Ref[]>("/api/crm/admin/collections"),
      api.get<Ref[]>("/api/crm/admin/branches"),
    ]);
    setRows(p); setCategories(c); setCollections(col); setBranches(b); setLoading(false);
  }
  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  return (
    <div>
      <PageHeader
        title="Catalog & Inventory"
        subtitle="Create a piece once — it appears on the customer boutique instantly."
        action={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> New product</Button>}
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Metal</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 overflow-hidden rounded-lg bg-muted">
                        {r.image ? <img src={r.image} alt="" className="size-full object-cover" /> : <Package className="m-2.5 size-5 text-muted-foreground" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 font-medium">
                          {r.name}
                          {r.featured && <Star className="size-3 fill-primary text-primary" />}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.category ?? "—"}{r.collection ? ` · ${r.collection}` : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.sku}</td>
                  <td className="px-4 py-3">{r.karat}K {r.metal}</td>
                  <td className="px-4 py-3">{r.priceMode === "INQUIRY" ? <span className="text-muted-foreground">On inquiry</span> : aed(r.basePrice)}</td>
                  <td className="px-4 py-3">
                    <span className={r.totalStock <= 2 ? "text-danger" : ""}>{r.totalStock}</span>
                    <span className="text-xs text-muted-foreground"> across {r.inventory.length}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.active ? <Badge tone="ACTIVE">Live</Badge> : <Badge>Archived</Badge>}
                    {r.isNew && <Badge tone="NEW"><span className="ml-1">New</span></Badge>}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No products yet — create your first piece.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ProductModal
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
        collections={collections}
        branches={branches}
        onSaved={() => { setOpen(false); load(); }}
      />
    </div>
  );
}

function ProductModal({ open, onClose, categories, collections, branches, onSaved }: {
  open: boolean; onClose: () => void; categories: Ref[]; collections: Ref[]; branches: Ref[]; onSaved: () => void;
}) {
  const empty = {
    sku: "", name: "", description: "", categoryId: "", collectionId: "", priceMode: "FIXED",
    basePrice: "0", metal: "Gold", karat: "22", metalColor: "Yellow", grossWeight: "0", netWeight: "0",
    gender: "Women", occasion: "", image: "", featured: false, isNew: true,
  };
  const [f, setF] = useState(empty);
  const [inv, setInv] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (!f.sku || !f.name) { setError("SKU and name are required."); return; }
    setBusy(true);
    try {
      await api.post("/api/crm/products", {
        sku: f.sku, name: f.name, description: f.description || undefined,
        categoryId: f.categoryId || null, collectionId: f.collectionId || null,
        priceMode: f.priceMode, basePrice: Number(f.basePrice), karat: Number(f.karat),
        metal: f.metal, metalColor: f.metalColor, grossWeight: Number(f.grossWeight), netWeight: Number(f.netWeight),
        gender: f.gender, occasion: f.occasion || undefined,
        images: f.image ? [f.image] : [],
        featured: f.featured, isNew: f.isNew,
        inventory: branches.map((b) => ({ branchId: b.id, quantity: Number(inv[b.id] ?? 0) })),
      });
      setF(empty); setInv({});
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New product" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU"><Input value={f.sku} onChange={(v) => setF({ ...f, sku: v })} placeholder="AR-2205" /></Field>
        <Field label="Name"><Input value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Solitaire Ring" /></Field>
        <div className="sm:col-span-2">
          <Field label="Description"><Input value={f.description} onChange={(v) => setF({ ...f, description: v })} /></Field>
        </div>
        <Field label="Category">
          <Select value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Collection">
          <Select value={f.collectionId} onChange={(v) => setF({ ...f, collectionId: v })}>
            <option value="">—</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Pricing">
          <Select value={f.priceMode} onChange={(v) => setF({ ...f, priceMode: v })}>
            <option value="FIXED">Fixed price</option>
            <option value="INQUIRY">Price on inquiry</option>
          </Select>
        </Field>
        <Field label="Base price (AED)"><Input type="number" value={f.basePrice} onChange={(v) => setF({ ...f, basePrice: v })} /></Field>
        <Field label="Karat">
          <Select value={f.karat} onChange={(v) => setF({ ...f, karat: v })}>
            {[24, 22, 21, 18].map((k) => <option key={k} value={k}>{k}K</option>)}
          </Select>
        </Field>
        <Field label="Metal colour">
          <Select value={f.metalColor} onChange={(v) => setF({ ...f, metalColor: v })}>
            {["Yellow", "White", "Rose"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Gross weight (g)"><Input type="number" value={f.grossWeight} onChange={(v) => setF({ ...f, grossWeight: v })} /></Field>
        <Field label="Net weight (g)"><Input type="number" value={f.netWeight} onChange={(v) => setF({ ...f, netWeight: v })} /></Field>
        <div className="sm:col-span-2">
          <Field label="Image URL"><Input value={f.image} onChange={(v) => setF({ ...f, image: v })} placeholder="https://…" /></Field>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Branch inventory</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {branches.map((b) => (
            <Field key={b.id} label={b.name}>
              <Input type="number" value={inv[b.id] ?? ""} onChange={(v) => setInv({ ...inv, [b.id]: v })} placeholder="0" />
            </Field>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> Featured</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isNew} onChange={(e) => setF({ ...f, isNew: e.target.checked })} /> New arrival</label>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Create product"}</Button>
      </div>
    </Modal>
  );
}
