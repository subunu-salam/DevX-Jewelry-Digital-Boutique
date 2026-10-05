import { useEffect, useState } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { datetime } from "@/lib/format";
import { useAuth, roleLabel } from "@/context/auth";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, EmptyState } from "@/components/ui";

interface TeamUser { id: string; name: string; email: string; role: string; branch: string | null; active: boolean; lastLoginAt: string | null }
interface AuditRow { id: string; action: string; entity: string; user: string; createdAt: string }
interface Branch { id: string; name: string }

const ROLES = ["OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER", "SALES_STAFF", "INVENTORY_STAFF", "ANALYST"];

export default function Team() {
  const { user } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "SALES_STAFF", branchId: "" });

  async function load() {
    try {
      const [u, a, b] = await Promise.all([
        api.get<TeamUser[]>("/api/crm/admin/users"),
        api.get<AuditRow[]>("/api/crm/admin/audit"),
        api.get<Branch[]>("/api/crm/admin/branches"),
      ]);
      setUsers(u); setAudit(a); setBranches(b);
    } catch {
      setDenied(true);
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    await api.post("/api/crm/admin/users", {
      name: f.name, email: f.email, password: f.password, role: f.role, branchId: f.branchId || null,
    });
    setF({ name: "", email: "", password: "", role: "SALES_STAFF", branchId: "" });
    setOpen(false); load();
  }

  if (denied) {
    return (
      <div>
        <PageHeader title="Team & Settings" />
        <Card className="p-10 text-center">
          <ShieldAlert className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Your role ({user && roleLabel(user.role)}) does not have access to team administration.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Team & Settings" subtitle="Users, roles and the security audit trail." action={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add user</Button>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold">Users</div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-5 py-3"><Badge>{roleLabel(u.role)}</Badge></td>
                  <td className="px-5 py-3 text-muted-foreground">{u.branch ?? "All branches"}</td>
                  <td className="px-5 py-3 text-right text-xs text-muted-foreground">{u.lastLoginAt ? datetime(u.lastLoginAt) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <div className="border-b border-border px-5 py-3 text-sm font-semibold">Audit log</div>
          <div className="max-h-96 overflow-y-auto">
            {audit.length === 0 ? <div className="p-5"><EmptyState message="No activity yet." /></div> : audit.map((a) => (
              <div key={a.id} className="border-b border-border px-5 py-2.5 text-xs last:border-0">
                <div className="font-medium">{a.action}</div>
                <div className="text-muted-foreground">{a.user} · {datetime(a.createdAt)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add user">
        <div className="space-y-3">
          <Field label="Name"><Input value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Field>
          <Field label="Email"><Input value={f.email} onChange={(v) => setF({ ...f, email: v })} /></Field>
          <Field label="Temporary password"><Input value={f.password} onChange={(v) => setF({ ...f, password: v })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={f.role} onChange={(v) => setF({ ...f, role: v })}>
                {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })}>
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={!f.name || !f.email || f.password.length < 6}>Create user</Button>
        </div>
      </Modal>
    </div>
  );
}
