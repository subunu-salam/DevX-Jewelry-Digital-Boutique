import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Loader2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { fileToDataUrl } from "@/lib/owner";
import { aed } from "@/lib/format";
import { useStore } from "@/context/store";
import SubHeader from "@/components/SubHeader";

interface Match {
  product: { id: string; name: string; slug: string; karat: number; metalColor: string; category: string | null; price: number; priceMode: string; image: string | null };
  reason: string;
}

export default function VisualSearch() {
  const navigate = useNavigate();
  const { addToCart } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null); setMatches(null); setNote(null);
    const dataUrl = await fileToDataUrl(file);
    setPreview(dataUrl);
    setLoading(true);
    try {
      const res = await api.post<{ ai: boolean; note?: string; matches: Match[] }>("/api/ai/visual-search", { imageBase64: dataUrl });
      setMatches(res.matches);
      if (!res.ai && res.note) setNote(res.note);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <SubHeader title="AI Visual Search" to="/ai" />
      <div className="px-4">
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Upload or snap a reference photo — a screenshot from Instagram or WhatsApp works — and we find the most similar pieces in our actual inventory.
        </p>

        <button
          onClick={() => fileRef.current?.click()}
          className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-brand bg-sand py-8 text-center"
        >
          {preview ? (
            <img src={preview} alt="reference" className="max-h-44 rounded-xl object-contain" />
          ) : (
            <>
              <Camera className="size-7 text-brand-deep" strokeWidth={1.6} />
              <span className="font-serif text-lg">Add a reference photo</span>
              <span className="text-xs text-muted-foreground">Tap to upload or take a photo</span>
            </>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />

        {loading && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching your inventory…
          </div>
        )}
        {error && <div className="mt-4 rounded-2xl bg-sand p-4 text-sm">{error}</div>}
        {note && <div className="mt-4 rounded-2xl bg-sand p-3 text-xs text-muted-foreground">{note}</div>}

        {matches && (
          <div className="mt-4">
            <div className="eyebrow mb-2">Similar in your inventory</div>
            <div className="space-y-2.5">
              {matches.map((m) => (
                <div key={m.product.id} className="flex gap-3 rounded-2xl border border-border bg-surface p-2.5">
                  <div className="size-[74px] flex-none overflow-hidden rounded-xl bg-champagne">
                    {m.product.image && <img src={m.product.image} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-serif text-[17px] leading-tight">{m.product.name}</div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.product.karat}K {m.product.metalColor} · {m.product.category}</div>
                    <div className="mt-0.5 text-sm font-medium">{m.product.priceMode === "INQUIRY" ? "On inquiry" : aed(m.product.price)}</div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => navigate(`/product/${m.product.slug}`)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs">View</button>
                      <button onClick={() => addToCart(m.product as never)} className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs"><Plus className="size-3" /> Add</button>
                      <button onClick={() => navigate("/appointments")} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs">Book</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
