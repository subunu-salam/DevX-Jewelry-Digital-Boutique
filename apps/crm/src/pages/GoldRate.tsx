import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { aed, datetime } from "@/lib/format";
import { Button, Card, Field, Input, PageHeader, Select, Badge } from "@/components/ui";

interface Obs { id: string; karat: number; pricePerGram: number; source: string; observedAt: string }

export default function GoldRate() {
  const [karat, setKarat] = useState("22");
  const [history, setHistory] = useState<Obs[]>([]);
  const [override, setOverride] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() { setHistory(await api.get<Obs[]>(`/api/crm/admin/gold/history?karat=${karat}`)); }
  useEffect(() => { load().catch(() => {}); /* eslint-disable-next-line */ }, [karat]);

  async function submitOverride() {
    if (!override) return;
    await api.post("/api/crm/admin/gold/override", { karat: Number(karat), pricePerGram: Number(override) });
    setOverride(""); setMsg("Manual rate saved (audited)"); setTimeout(() => setMsg(null), 2500); load();
  }

  const chart = [...history].reverse().map((h) => ({ date: new Date(h.observedAt).toLocaleDateString("en", { month: "short", day: "numeric" }), price: h.pricePerGram }));
  const latest = history[0];

  return (
    <div>
      <PageHeader title="Gold Rate" subtitle="Persisted observations with an audited manual override — the app never breaks if the feed is down." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{karat}K trend</h3>
              <div className="text-xs text-muted-foreground">Latest: {latest ? aed(latest.pricePerGram) : "—"} / g</div>
            </div>
            <Select value={karat} onChange={setKarat} className="h-8 w-24 text-xs">
              {[24, 22, 21, 18].map((k) => <option key={k} value={k}>{k}K</option>)}
            </Select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b08d57" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#b08d57" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={30} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={44} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip formatter={(v: number) => [aed(v), `${karat}K/g`]} contentStyle={{ borderRadius: 10, border: "1px solid #e6e9ef", fontSize: 13 }} />
                <Area type="monotone" dataKey="price" stroke="#b08d57" strokeWidth={2} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold">Manual override</h3>
          <p className="mt-1 text-xs text-muted-foreground">Set today's displayed retail rate. Recorded with a MANUAL source flag and an audit entry.</p>
          <div className="mt-4 space-y-3">
            <Field label={`${karat}K AED / gram`}><Input type="number" value={override} onChange={setOverride} placeholder="e.g. 436" /></Field>
            <Button onClick={submitOverride} disabled={!override} className="w-full">Save rate</Button>
            {msg && <p className="text-xs text-success">{msg}</p>}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold">Recent observations</div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {history.slice(0, 12).map((h) => (
              <tr key={h.id}>
                <td className="px-5 py-2.5">{datetime(h.observedAt)}</td>
                <td className="px-5 py-2.5 font-medium">{aed(h.pricePerGram)} / g</td>
                <td className="px-5 py-2.5 text-right"><Badge tone={h.source === "MANUAL" ? "WARNING" : ""}>{h.source}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
