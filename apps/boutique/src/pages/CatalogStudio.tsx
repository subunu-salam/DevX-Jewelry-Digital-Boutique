import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, MessageCircle } from "lucide-react";
import { ownerFetch, fileToDataUrl } from "@/lib/owner";
import SubHeader from "@/components/SubHeader";
import OwnerGate from "@/components/OwnerGate";

interface Draft {
  category: string; suggestedName: string; metal: string; karat: number; metalColor: string;
  tags: string[]; description: string; seoDescription: string; whatsappCard: string;
}
interface Ref { id: string; name: string }

export default function CatalogStudio() {
  return (
    <div>
      <SubHeader title="AI Catalog Studio" to="/ai" />
      <OwnerGate>
        <Panel />
      </OwnerGate>
    </div>
  );
}

function Panel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cats, setCats] = useState<Ref[]>([]);
  const [branches, setBranches] = useState<Ref[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState<{ sku: string; slug: string; wa: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ownerFetch<Ref[]>("/api/crm/admin/categories").then(setCats).catch(() => {});
    ownerFetch<Ref[]>("/api/crm/admin/branches").then((b) => { setBranches(b); setBranchId(b[0]?.id ?? ""); }).catch(() => {});
  }, []);

  async function onPick(file: File) {
    setError(null); setDraft(null); setDone(null); setNote(null);
    const du = await fileToDataUrl(file);
    setDataUrl(du); setPreview(du);
    setAnalyzing(true);
    try {
      const res = await ownerFetch<{ ai: boolean; note?: string; draft: Draft }>("/api/ai/catalog/analyze", { method: "POST", body: JSON.stringify({ imageBase64: du }) });
      setDraft(res.draft);
      if (!res.ai && res.note) setNote(res.note);
    } catch (e) { setError((e as Error).message); }
    finally { setAnalyzing(false); }
  }

  async function publish() {
    if (!draft) return;
    setPublishing(true); setError(null);
    try {
      const sku = "AR-" + Math.floor(1000 + Math.random() * 9000);
      const catId = cats.find((c) => c.name === draft.category)?.id ?? cats[0]?.id ?? null;
      await ownerFetch("/api/crm/products", {
        method: "POST",
        body: JSON.stringify({
          sku, name: draft.suggestedName || "New Piece", description: draft.description,
          categoryId: catId, priceMode: "INQUIRY", basePrice: 0, karat: Number(draft.karat) || 22,
          metal: draft.metal || "Gold", metalColor: draft.metalColor || "Yellow",
          gender: "Women", tags: draft.tags || [], images: dataUrl ? [dataUrl] : [], isNew: true,
          inventory: branchId ? [{ branchId, quantity: 1 }] : [],
        }),
      });
      const slug = (draft.suggestedName || "piece").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const wa = "https://wa.me/?text=" + encodeURIComponent((draft.whatsappCard || draft.suggestedName) + "\n\nyourjeweller.ae/product/" + slug + "-" + sku.slice(3));
      setDone({ sku, slug, wa });
    } catch (e) { setError((e as Error).message); }
    finally { setPublishing(false); }
  }

  if (done) {
    return (
      <div className="px-4 pt-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-white"><Check className="size-8" /></div>
        <h2 className="mt-4 font-serif text-2xl">Published to the boutique &amp; CRM</h2>
        <p className="mt-2 text-sm text-muted-foreground">{draft?.suggestedName} is now live and searchable — created as a real product in the shared database.</p>
        <p className="mt-1 text-xs text-brand-deep">yourjeweller.ae/product/{done.slug}-{done.sku.slice(3)}</p>
        <a href={done.wa} target="_blank" rel="noopener" className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-sm font-semibold text-white">
          <MessageCircle className="size-4" /> Share on WhatsApp
        </a>
      </div>
    );
  }

  return (
    <div className="px-4 pt-1">
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        A new piece arrives at the counter. Photograph it — AI drafts everything you need, then publishes it to the boutique and the CRM in one step.
      </p>
      <button onClick={() => fileRef.current?.click()} className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-brand bg-sand py-8">
        {preview ? <img src={preview} alt="" className="max-h-44 rounded-xl bg-white object-contain" /> : (
          <>
            <Camera className="size-7 text-brand-deep" strokeWidth={1.6} />
            <span className="font-serif text-lg">Add new jewellery</span>
            <span className="text-xs text-muted-foreground">Take / upload a product photo</span>
          </>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />

      {analyzing && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Detecting type, drafting copy &amp; SEO…
        </div>
      )}
      {error && <div className="mt-4 rounded-2xl bg-sand p-4 text-sm">{error}</div>}
      {note && <div className="mt-4 rounded-2xl bg-sand p-3 text-xs text-muted-foreground">{note}</div>}

      {draft && (
        <div className="mt-4 space-y-3">
          <div className="eyebrow text-[color:var(--color-ok,#2F7D5B)]">AI draft ready — review &amp; publish</div>
          <Field label="Name"><input className="ipt" value={draft.suggestedName} onChange={(e) => setDraft({ ...draft, suggestedName: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><input className="ipt" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></Field>
            <Field label="Metal"><input className="ipt" value={`${draft.karat}K ${draft.metalColor}`} onChange={(e) => setDraft({ ...draft, metalColor: e.target.value })} /></Field>
          </div>
          <Field label="Tags"><div className="flex flex-wrap gap-1.5">{(draft.tags || []).map((t) => <span key={t} className="rounded-full bg-foreground px-2.5 py-1 text-[11px] text-background">{t}</span>)}</div></Field>
          <Field label="Description"><textarea className="ipt min-h-[70px]" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Field label="SEO description"><textarea className="ipt min-h-[48px]" value={draft.seoDescription} onChange={(e) => setDraft({ ...draft, seoDescription: e.target.value })} /></Field>
          <Field label="WhatsApp card"><textarea className="ipt min-h-[56px]" value={draft.whatsappCard} onChange={(e) => setDraft({ ...draft, whatsappCard: e.target.value })} /></Field>
          <Field label="Assign to branch">
            <select className="ipt" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <button onClick={publish} disabled={publishing} className="w-full rounded-full bg-foreground py-3.5 text-sm font-semibold text-background disabled:opacity-50">
            {publishing ? "Publishing…" : "Publish to boutique & CRM"}
          </button>
        </div>
      )}
      <style>{`.ipt{width:100%;border:1px solid var(--color-border);background:var(--color-background);border-radius:.75rem;padding:.6rem .75rem;font-size:14px;outline:none}.ipt:focus{border-color:var(--color-brand)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
