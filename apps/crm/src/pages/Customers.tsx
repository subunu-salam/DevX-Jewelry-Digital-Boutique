import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { date } from "@/lib/format";
import { Badge, Card, PageHeader, EmptyState } from "@/components/ui";

interface Customer {
  id: string; name: string; phone: string; email: string | null; segment: string;
  marketingConsent: boolean; inquiries: number; appointments: number; invoices: number;
  hasAccount: boolean; createdAt: string;
}
const SEGMENT_LABEL: Record<string, string> = { new: "New", repeat: "Repeat", high_value: "High value", inactive: "Inactive" };

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  useEffect(() => { api.get<Customer[]>("/api/crm/sales/customers").then(setCustomers).catch(() => {}); }, []);

  return (
    <div>
      <PageHeader title="Customers" subtitle="Boutique accounts and inquiry-captured contacts, with consent state." />
      <Card>
        {customers.length === 0 ? <div className="p-6"><EmptyState message="No customers yet." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Segment</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Consent</th>
                  <th className="px-4 py-3 font-medium">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{c.name.charAt(0)}</div>
                        <div>
                          <div className="font-medium">{c.name} {c.hasAccount && <span className="ml-1 text-[10px] text-primary">● account</span>}</div>
                          <div className="text-xs text-muted-foreground">{c.phone}{c.email ? ` · ${c.email}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge>{SEGMENT_LABEL[c.segment] ?? c.segment}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.inquiries} inquiries · {c.appointments} visits · {c.invoices} invoices</td>
                    <td className="px-4 py-3">{c.marketingConsent ? <Badge tone="ACTIVE">Opted in</Badge> : <Badge>No consent</Badge>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{date(c.createdAt)}</td>
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
