import { useEffect, useState } from "react";
import { FileText, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { datetime, aed } from "@/lib/format";
import { Badge, Button, PageHeader, Select } from "@/components/ui";
import QuoteModal from "@/components/QuoteModal";

interface Inquiry {
  id: string; reference: string; status: string; source: string;
  customerName: string; customerPhone: string | null; branchName: string | null;
  assignedTo: string | null; assignedToId: string | null; itemCount: number;
  items: { productId: string | null; productName: string; quantity: number }[];
  budget: number | null; occasion: string | null; createdAt: string;
}
interface TeamUser { id: string; name: string }

const STAGES = ["NEW", "QUALIFIED", "QUOTED", "APPOINTMENT", "CONVERTED", "LOST"];
const STAGE_LABEL: Record<string, string> = {
  NEW: "New", QUALIFIED: "Qualified", QUOTED: "Quoted", APPOINTMENT: "Appointment", CONVERTED: "Converted", LOST: "Lost",
};

export default function Inquiries() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [quoteFor, setQuoteFor] = useState<Inquiry | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    const list = await api.get<Inquiry[]>("/api/crm/sales/inquiries");
    setInquiries(list);
  }
  useEffect(() => {
    load().catch(() => {});
    api.get<{ id: string; name: string }[]>("/api/crm/admin/users").then((u) => setTeam(u.map((x) => ({ id: x.id, name: x.name })))).catch(() => setTeam([]));
  }, []);

  async function setStatus(id: string, status: string) {
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    await api.patch(`/api/crm/sales/inquiries/${id}`, { status }).catch(() => load());
  }
  async function assign(id: string, assignedToId: string) {
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, assignedToId } : i)));
    await api.patch(`/api/crm/sales/inquiries/${id}`, { assignedToId: assignedToId || null }).catch(() => load());
  }

  return (
    <div>
      <PageHeader title="Leads / Inquiries" subtitle="Every boutique inquiry lands here as a trackable lead." />

      <div className="grid gap-4 overflow-x-auto lg:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage) => {
          const items = inquiries.filter((i) => i.status === stage);
          return (
            <div key={stage} className="min-w-[240px]">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{STAGE_LABEL[stage]}</span>
                <Badge tone={stage}>{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.map((i) => (
                  <div key={i.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{i.customerName}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{i.reference}</span>
                    </div>
                    {i.customerPhone && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" /> {i.customerPhone}</div>
                    )}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {i.items.slice(0, 2).map((it) => it.productName).join(", ")}{i.itemCount > 2 ? ` +${i.itemCount - 2}` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {i.branchName && <span>{i.branchName}</span>}
                      {i.budget && <span>· {aed(i.budget)}</span>}
                      <span>· {i.source}</span>
                    </div>

                    <div className="mt-3 space-y-2">
                      <Select value={i.status} onChange={(v) => setStatus(i.id, v)} className="h-8 text-xs">
                        {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                      </Select>
                      {team.length > 0 && (
                        <Select value={i.assignedToId ?? ""} onChange={(v) => assign(i.id, v)} className="h-8 text-xs">
                          <option value="">Unassigned</option>
                          {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </Select>
                      )}
                      <Button size="sm" variant="outline" className="w-full" onClick={() => setQuoteFor(i)}>
                        <FileText className="size-3.5" /> Create quote
                      </Button>
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground">{datetime(i.createdAt)}</div>
                  </div>
                ))}
                {items.length === 0 && <div className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">Empty</div>}
              </div>
            </div>
          );
        })}
      </div>

      {quoteFor && (
        <QuoteModal
          open
          onClose={() => setQuoteFor(null)}
          inquiryId={quoteFor.id}
          seedItems={quoteFor.items.map((it) => it.productName)}
          onSaved={() => { setQuoteFor(null); setToast("Quotation created"); load(); setTimeout(() => setToast(null), 2500); }}
        />
      )}
      {toast && <div className="fixed bottom-6 right-6 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground shadow-lg gold-glow">{toast}</div>}
    </div>
  );
}
