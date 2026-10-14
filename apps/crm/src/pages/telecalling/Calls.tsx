import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, CalendarPlus, Clock, Crown, Gift, MessageCircle, Phone, PhoneOff, Plus, UserRound } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { datetime } from "@/lib/format";
import { useAuth } from "@/context/auth";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { Count, Empty, Segmented, initials, useToast } from "@/components/lux";
import ScheduleModal from "@/components/ScheduleModal";
import { OUTCOMES, TIER_STYLE, waLink, type CallTask, type Tier } from "@/lib/retention";
import { SEGMENT_LABEL, offerText, useTeleConfig, type Segment } from "@/lib/telecalling";
import TelecallingShell from "@/components/TelecallingShell";

type Tab = "due" | "upcoming" | "done";
const TABS: { value: Tab; label: string }[] = [{ value: "due", label: "Due now" }, { value: "upcoming", label: "Upcoming" }, { value: "done", label: "Done (14 d)" }];
const PRI: Record<string, string> = { HIGH: "bg-danger-bg text-danger", MEDIUM: "bg-warning-bg text-warning", LOW: "bg-muted text-muted-foreground" };

export default function Calls() {
  const toast = useToast();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<CallTask[] | null>(null);
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<Tab>("due");
  const [mine, setMine] = useState(false);
  const [logFor, setLogFor] = useState<CallTask | null>(null);
  const [bookFor, setBookFor] = useState<CallTask | null>(null);
  const [adding, setAdding] = useState(false);

  const load = () => api.get<CallTask[]>(`/api/crm/retention/calls${mine ? "?mine=1" : ""}`).then(setTasks).catch(() => setTasks([]));
  useEffect(() => { load(); }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.get<{ id: string; name: string }[]>("/api/crm/admin/users").then((u) => setTeam(u.map((x) => ({ id: x.id, name: x.name })))).catch(() => {}); }, []);

  const now = Date.now();
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const all = tasks ?? [];
  const open = all.filter((t) => t.status === "OPEN");
  const due = open.filter((t) => new Date(t.dueAt).getTime() <= endOfToday.getTime());
  const overdue = open.filter((t) => new Date(t.dueAt).getTime() < now - 864e5);
  const done = all.filter((t) => t.status === "DONE");
  const weekDone = done.filter((t) => t.completedAt && now - new Date(t.completedAt).getTime() < 7 * 864e5);
  const reached = done.filter((t) => t.outcome === "REACHED" || t.outcome === "VISIT_BOOKED").length;
  const booked = done.filter((t) => t.outcome === "VISIT_BOOKED").length;
  const shown = useMemo(() => {
    const list = tab === "due" ? due : tab === "upcoming" ? open.filter((t) => !due.includes(t)) : done;
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    return tab === "done" ? list : [...list].sort((a, b) => rank[a.priority] - rank[b.priority] || +new Date(a.dueAt) - +new Date(b.dueAt));
  }, [tab, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  async function assign(t: CallTask, id: string) {
    await api.patch(`/api/crm/retention/calls/${t.id}`, { assignedToId: id || null }).catch(() => {});
    toast("Call assigned"); load();
  }

  return (
    <TelecallingShell
      title="Call queue"
      subtitle="Calls raised from recurring-customer alerts and churn alerts, or added by hand. Log every attempt — record why the client hasn't bought, what they said, and request an offer if it will win them back."
      actions={<>
        <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-[#d4af6a]" /> My calls</label>
        <Link to="/telecalling/recurring" className="btn-line">Recurring customers</Link>
        <button onClick={() => setAdding(true)} className="btn-gold"><Plus className="size-4" /> New call</button>
      </>}
    >
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Due today" value={due.length} sub={`${overdue.length} overdue`} tone={overdue.length ? "warn" : undefined} />
        <Stat label="Open in queue" value={open.length} sub={`${open.filter((t) => t.priority === "HIGH").length} high priority`} />
        <Stat label="Completed this week" value={weekDone.length} sub="calls closed" />
        <Stat label="Reach rate" value={done.length ? Math.round((reached / done.length) * 100) : 0} suffix="%" sub="of closed calls" />
        <Stat label="Visits booked" value={booked} sub="from retention calls" tone={booked ? "ok" : undefined} />
      </div>

      <div className="mb-3 flex items-center justify-between"><Segmented options={TABS} value={tab} onChange={setTab} /><span className="text-xs text-muted-foreground">{shown.length} calls</span></div>

      {!tasks ? <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}</div>
        : shown.length === 0 ? <div className="lux-card p-8"><Empty text={tab === "due" ? "Nothing due — open Loyalty & Retention to queue calls for clients who are drifting away." : "No calls here."} /></div>
          : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((t, i) => {
                const late = t.status === "OPEN" && new Date(t.dueAt).getTime() < now;
                const lastNote = t.notes?.split("\n").filter((l) => !l.startsWith("Suggested opener")).at(-1);
                const opener = t.notes?.split("\n").find((l) => l.startsWith("Suggested opener"))?.replace("Suggested opener: ", "");
                return (
                  <div key={t.id} className="lux-card card-lift rise flex flex-col p-4" style={{ ["--d" as string]: `${i * 40}ms` } as React.CSSProperties}>
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(t.customerName)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">{t.customerName}</span>
                          {t.tier && <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-semibold", TIER_STYLE[t.tier as Tier]?.chip)}><Crown className="size-2.5" />{t.tier}</span>}
                          {t.segment && <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{SEGMENT_LABEL[t.segment as Segment]}</span>}
                          <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", PRI[t.priority])}>{t.priority.toLowerCase()}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{t.customerPhone ?? "No phone"}</div>
                      </div>
                    </div>
                    <p className="mt-3 text-[13px] leading-5 text-foreground/85">{t.reason}</p>
                    {opener && t.status === "OPEN" && <p className="mt-2 rounded-lg bg-primary/[0.07] px-2.5 py-2 text-[12px] leading-5 text-foreground/80">“{opener}”</p>}
                    {t.lostReason && <p className="mt-2 text-[11.5px]"><span className="text-muted-foreground">Reason:</span> {t.lostReason}</p>}
                    {lastNote && <p className="mt-2 truncate text-[11.5px] text-muted-foreground" title={t.notes ?? ""}>{lastNote}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                      <span className={cn("inline-flex items-center gap-1", late && "text-danger")}><Clock className="size-3.5" />{t.status === "DONE" ? `Done ${datetime(t.completedAt)}` : `${late ? "Overdue · " : ""}${datetime(t.dueAt)}`}</span>
                      {t.attempts > 0 && <span>{t.attempts} attempt{t.attempts > 1 ? "s" : ""}</span>}
                      {t.outcome && <span className="text-foreground/70">{OUTCOMES.find((o) => o.value === t.outcome)?.label}</span>}
                    </div>
                    <div className="mt-auto pt-3">
                      <div className="mb-2 flex items-center gap-2 text-xs">
                        <UserRound className="size-3.5 text-muted-foreground" />
                        <select value={t.assignedToId ?? ""} onChange={(e) => assign(t, e.target.value)} className="h-7 flex-1 rounded-md border border-input bg-card px-2 text-xs outline-none focus:border-primary">
                          <option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === user?.id ? " (me)" : ""}</option>)}
                        </select>
                      </div>
                      {t.status === "OPEN" && (
                        <div className="flex gap-2">
                          {t.customerPhone && <a href={`tel:${t.customerPhone.replace(/\s/g, "")}`} className="btn-gold flex-1 !h-8 !text-xs"><Phone className="size-3.5" /> Call</a>}
                          <button onClick={() => setLogFor(t)} className="btn-line flex-1 !h-8 !text-xs">Log outcome</button>
                          {t.customerPhone && <a href={waLink(t.customerPhone, opener ?? `Hello ${t.customerName.split(" ")[0]}, this is Aurelia Fine Jewellery.`)} target="_blank" rel="noopener noreferrer" className="btn-line !h-8 !px-2.5 hover:!border-success/50 hover:!text-success" aria-label="WhatsApp"><MessageCircle className="size-3.5" /></a>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

      <LogModal task={logFor} onClose={() => setLogFor(null)} onSaved={(t, outcome, offerMsg) => {
        setLogFor(null); load();
        toast(offerMsg ?? (outcome === "VISIT_BOOKED" ? "Great — now pick the visit time" : outcome === "NO_ANSWER" || outcome === "CALLBACK" ? "Call rescheduled" : "Call closed"));
        if (outcome === "VISIT_BOOKED") setBookFor(t);
      }} />
      <ScheduleModal open={!!bookFor} prefill={bookFor ? { name: bookFor.customerName, phone: bookFor.customerPhone, reason: "Showroom visit" } : null}
        onClose={() => setBookFor(null)} onSaved={(ref) => { setBookFor(null); toast(`Appointment ${ref} booked`); }} />
      <NewCallModal open={adding} team={team} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast("Call added to the queue"); load(); }} />
    </TelecallingShell>
  );
}

function Stat({ label, value, sub, suffix, tone }: { label: string; value: number; sub: string; suffix?: string; tone?: "warn" | "ok" }) {
  return (
    <div className="lux-card lux-sheen p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "warn" && "text-warning", tone === "ok" && "text-success")}><Count value={value} />{suffix}</div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function LogModal({ task, onClose, onSaved }: { task: CallTask | null; onClose: () => void; onSaved: (t: CallTask, outcome: string, offerMsg?: string) => void }) {
  const cfg = useTeleConfig();
  const [outcome, setOutcome] = useState("REACHED");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [nextAt, setNextAt] = useState("");
  const [wantOffer, setWantOffer] = useState(false);
  const [oType, setOType] = useState("MAKING_DISCOUNT");
  const [oValue, setOValue] = useState("10");
  const [oWhy, setOWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (task) { setOutcome("REACHED"); setReason(""); setFeedback(""); setWantOffer(false); setOType("MAKING_DISCOUNT"); setOValue("10"); setOWhy(""); setError(null); setNextAt(new Date(Date.now() + 864e5).toISOString().slice(0, 16)); }
  }, [task]);
  if (!task) return null;
  const retry = outcome === "CALLBACK" || outcome === "NO_ANSWER";
  const spoke = outcome !== "NO_ANSWER" && outcome !== "WRONG_NUMBER";
  const rule = cfg?.offerTypes[oType];
  const needsApproval = rule ? Number(oValue) > rule.autoLimit : true;

  async function save() {
    if (wantOffer && (!Number(oValue) || oWhy.trim().length < 3)) { setError("Give the offer a value and say why it will help."); return; }
    setBusy(true); setError(null);
    try {
      await api.patch(`/api/crm/retention/calls/${task!.id}`, {
        outcome, notes: feedback.trim() || undefined, lostReason: spoke && reason ? reason : undefined, feedback: spoke && feedback.trim() ? feedback.trim() : undefined,
        nextAt: retry && nextAt ? new Date(nextAt).toISOString() : undefined,
      });
      let msg: string | undefined;
      if (wantOffer && spoke) {
        const o = await api.post<{ status: string; reference: string }>("/api/crm/telecalling/offers", {
          callTaskId: task!.id, customerId: task!.customerId ?? undefined, customerName: task!.customerName, customerPhone: task!.customerPhone,
          type: oType, value: Number(oValue), reason: `${oWhy.trim()}${reason ? ` (reason: ${reason})` : ""}`,
        });
        msg = o.status === "APPROVED" ? `Call saved · offer ${o.reference} approved — share the code with the client` : `Call saved · offer ${o.reference} sent to a manager for approval`;
      }
      onSaved(task!, outcome, msg);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Update call · ${task.customerName}`} wide>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">1 · Were you able to talk to them?</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OUTCOMES.map((o) => (
          <button key={o.value} onClick={() => setOutcome(o.value)} className={cn("rounded-lg border px-3 py-2 text-left text-sm transition", outcome === o.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
            {o.value === "NO_ANSWER" ? <PhoneOff className="mr-1.5 inline size-3.5" /> : o.value === "VISIT_BOOKED" ? <CalendarPlus className="mr-1.5 inline size-3.5" /> : null}{o.label}
          </button>
        ))}
      </div>
      {retry && <div className="mt-3 max-w-xs"><Field label="Call again at"><Input type="datetime-local" value={nextAt} onChange={setNextAt} /></Field></div>}

      {spoke && (
        <>
          <div className="mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">2 · Why haven't they purchased?</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(cfg?.lostReasons ?? []).map((r) => (
              <button key={r} onClick={() => setReason((x) => (x === r ? "" : r))} className={cn("rounded-full border px-3 py-1 text-xs transition", reason === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{r}</button>
            ))}
          </div>
          <div className="mt-3"><Field label="What did the customer say? What could we offer?">
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="e.g. Flying to Kochi in December, buying wedding gold there because it feels cheaper. Open to coming in if we can match making charges." className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
          </Field></div>

          <div className="mt-5 rounded-xl border border-border p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={wantOffer} onChange={(e) => setWantOffer(e.target.checked)} className="accent-[#d4af6a]" /><Gift className="size-4 text-primary" /> 3 · Generate an offer for this customer</label>
            {wantOffer && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_0.6fr]">
                <Field label="Offer"><Select value={oType} onChange={(v) => { setOType(v); const t = cfg?.offerTypes[v]; if (t) setOValue(String(t.autoLimit || (t.unit === "AED" ? 250 : 5))); }}>
                  {Object.entries(cfg?.offerTypes ?? {}).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                </Select></Field>
                <Field label={`Value (${rule?.unit ?? ""})`}><Input type="number" value={oValue} onChange={setOValue} /></Field>
                <div className="sm:col-span-2"><Field label="Why this offer will win them back"><Input value={oWhy} onChange={setOWhy} placeholder="e.g. Matches what she'd pay in India; she's buying a bridal set worth ~AED 40k" /></Field></div>
                <div className={cn("sm:col-span-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs", needsApproval ? "bg-warning-bg text-warning" : "bg-success-bg text-success")}>
                  <BadgeCheck className="size-4" />
                  {rule && (needsApproval
                    ? `Above your limit of ${rule.autoLimit}${rule.unit === "%" ? "%" : ` ${rule.unit}`} — this goes to a manager for approval.`
                    : `Within your limit — ${offerText(oType, Number(oValue), cfg)} will be approved straight away.`)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : wantOffer && spoke ? (needsApproval ? "Save & request approval" : "Save & create offer") : "Save update"}</Button></div>
    </Modal>
  );
}

function NewCallModal({ open, team, onClose, onSaved }: { open: boolean; team: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const blank = { name: "", phone: "", reason: "", priority: "MEDIUM", assignedToId: "", dueAt: "" };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ ...blank, dueAt: new Date(Date.now() + 36e5).toISOString().slice(0, 16) }); setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof blank) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    if (f.name.trim().length < 2 || f.reason.trim().length < 2) { setError("Add the client's name and a reason for the call."); return; }
    setBusy(true);
    try {
      await api.post("/api/crm/retention/calls", { customerName: f.name.trim(), customerPhone: f.phone.trim() || null, reason: f.reason.trim(), priority: f.priority, source: "manual", assignedToId: f.assignedToId || null, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : undefined });
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="New retention call">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client name *"><Input value={f.name} onChange={set("name")} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} type="tel" placeholder="+971 50 123 4567" /></Field>
        <Field label="Priority"><Select value={f.priority} onChange={set("priority")}><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></Select></Field>
        <Field label="Assign to"><Select value={f.assignedToId} onChange={set("assignedToId")}><option value="">Unassigned</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Call at"><Input type="datetime-local" value={f.dueAt} onChange={set("dueAt")} /></Field>
      </div>
      <div className="mt-3"><Field label="Reason *"><Input value={f.reason} onChange={set("reason")} placeholder="e.g. Anniversary next month — invite to preview" /></Field></div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Adding…" : "Add call"}</Button></div>
    </Modal>
  );
}
