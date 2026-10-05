import { useEffect, useState } from "react";
import { Copy, FileText, Plus, ArrowRight } from "lucide-react";
import { api, API_URL } from "@/lib/api";
import { aed, date } from "@/lib/format";
import { Badge, Button, Card, PageHeader, Select, EmptyState } from "@/components/ui";
import QuoteModal from "@/components/QuoteModal";

interface Quote {
  id: string; reference: string; status: string; customerName: string; branchName: string | null;
  total: number; items: number; shareToken: string; validUntil: string | null; createdAt: string;
}
const STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

export default function Quotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() { setQuotes(await api.get<Quote[]>("/api/crm/sales/quotes")); }
  useEffect(() => { load().catch(() => {}); }, []);

  async function setStatus(id: string, status: string) {
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
    await api.patch(`/api/crm/sales/quotes/${id}`, { status }).catch(() => load());
  }
  async function convert(id: string) {
    try {
      const res = await api.post<{ reference: string }>(`/api/crm/sales/quotes/${id}/convert`);
      flash(`Invoice ${res.reference} created`);
      load();
    } catch (e) { flash((e as Error).message); }
  }
  function copyShare(token: string) {
    navigator.clipboard?.writeText(`${API_URL}/api/public/quotes/shared/${token}`).catch(() => {});
    flash("Share link copied");
  }
  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2500); }

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Priced proposals with a customer-shareable link — one click to invoice."
        action={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> New quote</Button>}
      />
      <Card>
        {quotes.length === 0 ? <div className="p-6"><EmptyState message="No quotations yet. Create one from a lead or here." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Ref</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Valid</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">{q.reference}</td>
                    <td className="px-4 py-3">{q.customerName}<div className="text-xs text-muted-foreground">{q.items} items{q.branchName ? ` · ${q.branchName}` : ""}</div></td>
                    <td className="px-4 py-3 font-medium">{aed(q.total)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{date(q.validUntil)}</td>
                    <td className="px-4 py-3">
                      <Select value={q.status} onChange={(v) => setStatus(q.id, v)} className="h-8 w-32 text-xs">
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => copyShare(q.shareToken)}><Copy className="size-3.5" /> Link</Button>
                        <Button size="sm" variant="outline" onClick={() => convert(q.id)}>Invoice <ArrowRight className="size-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && <QuoteModal open onClose={() => setOpen(false)} onSaved={() => { setOpen(false); flash("Quotation created"); load(); }} />}
      {toast && <div className="fixed bottom-6 right-6 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground shadow-lg gold-glow">{toast}</div>}
    </div>
  );
}
