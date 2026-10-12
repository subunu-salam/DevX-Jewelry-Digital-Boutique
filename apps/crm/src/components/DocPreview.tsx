import { Printer, X } from "lucide-react";
import { aed, date } from "@/lib/format";

export interface DocLine { description: string; quantity: number; unitPrice: number; lineTotal: number; detail?: string }
export interface DocData {
  kind: "Quotation" | "Tax invoice";
  reference: string;
  status?: string;
  issuedAt?: string | null;
  validUntil?: string | null;
  customer?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  branchName?: string | null;
  lines: DocLine[];
  subtotal: number;
  discount?: number;
  taxRate: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  notes?: string | null;
}

const BRAND = "Aurelia Fine Jewellery";

/** A4-style document the customer would receive. Prints cleanly (only the paper is printed). */
export function DocPaper({ d }: { d: DocData }) {
  const due = d.amountPaid !== undefined ? d.total - d.amountPaid : undefined;
  return (
    <div className="print-doc mx-auto w-full max-w-[760px] rounded-lg bg-[#FFFDF8] p-8 text-[#26221D] shadow-2xl sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[#E4DBCB] pb-6">
        <div>
          <div className="font-serif text-2xl tracking-[0.18em]" style={{ fontFamily: "Georgia, serif" }}>AURELIA</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.3em] text-[#86683A]">Fine Jewellery</div>
          <div className="mt-3 text-xs leading-5 text-[#6F675B]">{d.branchName ?? BRAND}<br />Dubai, United Arab Emirates</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold uppercase tracking-wide text-[#86683A]">{d.kind}</div>
          <div className="mt-1 font-mono text-sm">{d.reference || "DRAFT"}</div>
          <div className="mt-2 text-xs leading-5 text-[#6F675B]">
            Date: {date(d.issuedAt ?? new Date().toISOString())}
            {d.validUntil && <><br />Valid until: {date(d.validUntil)}</>}
            {d.status && <><br />Status: {d.status}</>}
          </div>
        </div>
      </div>

      <div className="py-5 text-sm">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#6F675B]">{d.kind === "Quotation" ? "Prepared for" : "Billed to"}</div>
        <div className="mt-1 font-medium">{d.customer?.name || "—"}</div>
        <div className="text-xs text-[#6F675B]">{[d.customer?.phone, d.customer?.email].filter(Boolean).join(" · ")}</div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-[#E4DBCB] text-left text-[10px] uppercase tracking-[0.15em] text-[#6F675B]">
            <th className="py-2 font-medium">Item</th><th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit price</th><th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i} className="border-b border-[#EFE8DA] align-top">
              <td className="py-2.5 pr-3">{l.description}{l.detail && <div className="text-[11px] text-[#6F675B]">{l.detail}</div>}</td>
              <td className="py-2.5 text-right">{l.quantity}</td>
              <td className="py-2.5 text-right">{aed(l.unitPrice)}</td>
              <td className="py-2.5 text-right font-medium">{aed(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-4 w-full max-w-[280px] space-y-1.5 text-sm">
        <Row k="Subtotal" v={aed(d.subtotal)} />
        {!!d.discount && <Row k="Discount" v={`− ${aed(d.discount)}`} />}
        <Row k={`VAT (${d.taxRate}%)`} v={aed(d.taxTotal)} />
        <div className="flex justify-between border-t border-[#26221D] pt-2 text-base font-semibold"><span>Total</span><span>{aed(d.total)}</span></div>
        {d.amountPaid !== undefined && <><Row k="Paid" v={aed(d.amountPaid)} /><Row k="Balance due" v={aed(due ?? 0)} strong /></>}
      </div>

      {d.notes && <div className="mt-6 rounded-md bg-[#F1EADC] p-3 text-xs text-[#6F675B]"><b className="text-[#26221D]">Notes: </b>{d.notes}</div>}
      <div className="mt-8 border-t border-[#E4DBCB] pt-4 text-center text-[11px] leading-5 text-[#6F675B]">
        {d.kind === "Quotation" ? "Gold-linked prices are indicative and confirmed at the rate on the day of purchase." : "Thank you for choosing Aurelia. Please retain this invoice for warranty and buy-back."}
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-semibold" : "text-[#6F675B]"}`}><span>{k}</span><span>{v}</span></div>;
}

/** Full-screen preview overlay with Print / Save as PDF. */
export default function DocPreview({ d, onClose, actions }: { d: DocData | null; onClose: () => void; actions?: React.ReactNode }) {
  if (!d) return null;
  return (
    <div className="print-root fixed inset-0 z-[60] overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div className="mx-auto max-w-[760px]" onClick={(e) => e.stopPropagation()}>
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-white/80">Preview · {d.kind} {d.reference}</div>
          <div className="flex gap-2">
            {actions}
            <button onClick={() => window.print()} className="btn-gold"><Printer className="size-4" /> Print / PDF</button>
            <button onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-white/20 px-3 text-sm text-white hover:bg-white/10"><X className="size-4" /></button>
          </div>
        </div>
        <DocPaper d={d} />
      </div>
    </div>
  );
}

/* Mappers from API rows */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function quoteToDoc(q: any): DocData {
  return {
    kind: "Quotation", reference: q.reference, status: q.status, issuedAt: q.createdAt, validUntil: q.validUntil,
    customer: q.customer, branchName: q.branch?.name ?? null, notes: q.notes,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: (q.items ?? []).map((it: any) => {
      const unit = (it.metalValue ?? 0) + (it.makingValue ?? 0) + (it.stoneValue ?? 0);
      const parts = [it.metalValue && `Metal ${aed(it.metalValue)}`, it.makingValue && `Making ${aed(it.makingValue)}`, it.stoneValue && `Stones ${aed(it.stoneValue)}`].filter(Boolean);
      return { description: it.description, quantity: it.quantity, unitPrice: unit, lineTotal: it.lineTotal ?? unit * it.quantity, detail: parts.length > 1 ? parts.join(" · ") : undefined };
    }),
    subtotal: (q.subtotal ?? 0) + (q.makingTotal ?? 0), discount: q.discount, taxRate: q.taxRate, taxTotal: q.taxTotal, total: q.total,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function invoiceToDoc(i: any): DocData {
  return {
    kind: "Tax invoice", reference: i.reference, status: i.status, issuedAt: i.issuedAt ?? i.createdAt,
    customer: i.customer, branchName: i.branch?.name ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: (i.items ?? []).map((it: any) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, lineTotal: it.lineTotal })),
    subtotal: i.subtotal, taxRate: i.taxRate, taxTotal: i.taxTotal, total: i.total, amountPaid: i.amountPaid,
  };
}
