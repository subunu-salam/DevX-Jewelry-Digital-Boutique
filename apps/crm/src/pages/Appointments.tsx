import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { datetime } from "@/lib/format";
import { CalendarPlus } from "lucide-react";
import { Button, Card, PageHeader, Select, EmptyState } from "@/components/ui";
import ScheduleModal from "@/components/ScheduleModal";
import { useToast } from "@/components/lux";

interface Appt {
  id: string; reference: string; customerName: string; customerPhone: string | null;
  branchName: string; staffName: string | null; reason: string; scheduledAt: string; status: string;
}
const STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

export default function Appointments() {
  const toast = useToast();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const load = () => api.get<Appt[]>("/api/crm/sales/appointments").then(setAppts).catch(() => {});
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    await api.patch(`/api/crm/sales/appointments/${id}`, { status }).catch(() => {});
  }

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Showroom visits booked from the boutique app and the CRM."
        action={<Button onClick={() => setScheduling(true)}><CalendarPlus className="size-4" /> Schedule appointment</Button>}
      />
      <ScheduleModal open={scheduling} onClose={() => setScheduling(false)} onSaved={(ref) => { setScheduling(false); toast(`Appointment ${ref} booked`); load(); }} />
      <Card>
        {appts.length === 0 ? <div className="p-6"><EmptyState message="No appointments yet — use Schedule appointment to book one." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Advisor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appts.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{datetime(a.scheduledAt)}</td>
                    <td className="px-4 py-3">{a.customerName}<div className="text-xs text-muted-foreground">{a.customerPhone}</div></td>
                    <td className="px-4 py-3">{a.reason}</td>
                    <td className="px-4 py-3">{a.branchName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.staffName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Select value={a.status} onChange={(v) => setStatus(a.id, v)} className="h-8 w-36 text-xs">
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </Select>
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
