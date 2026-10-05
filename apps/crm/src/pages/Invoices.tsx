import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { aed, date } from "@/lib/format";
import { Badge, Button, Card, PageHeader, EmptyState } from "@/components/ui";

interface Invoice {
  id: string; reference: string; status: string; customerName: string; branchName: string | null;
  total: number; amountPaid: number; issuedAt: string | null; createdAt: string;
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  async function load() { setInvoices(await api.get<Invoice[]>("/api/crm/sales/invoices")); }
  useEffect(() => { load().catch(() => {}); }, []);

  async function markPaid(inv: Invoice) {
    setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: "PAID", amountPaid: inv.total } : i)));
    await api.patch(`/api/crm/sales/invoices/${inv.id}`, { status: "PAID", amountPaid: inv.total }).catch(() => load());
  }

  const totalIssued = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.amountPaid, 0);

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Generated from accepted quotes — no re-entry of product or customer data." />
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total invoiced</div><div className="mt-1 text-2xl font-semibold">{aed(totalIssued)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Collected</div><div className="mt-1 text-2xl font-semibold">{aed(totalPaid)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="mt-1 text-2xl font-semibold">{aed(totalIssued - totalPaid)}</div></Card>
      </div>
      <Card>
        {invoices.length === 0 ? <div className="p-6"><EmptyState message="No invoices yet — convert an accepted quote." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Ref</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">{i.reference}</td>
                    <td className="px-4 py-3">{i.customerName}<div className="text-xs text-muted-foreground">{i.branchName ?? "—"}</div></td>
                    <td className="px-4 py-3 font-medium">{aed(i.total)}</td>
                    <td className="px-4 py-3">{aed(i.amountPaid)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{date(i.issuedAt)}</td>
                    <td className="px-4 py-3"><Badge tone={i.status}>{i.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {i.status !== "PAID" && <Button size="sm" variant="outline" onClick={() => markPaid(i)}>Mark paid</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
