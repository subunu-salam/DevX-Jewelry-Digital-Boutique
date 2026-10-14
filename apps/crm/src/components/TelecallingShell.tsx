import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { BadgeCheck, Headset, PhoneCall, Repeat, Trophy } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";

/** Section frame for the Telecalling module — its own header + tabs, separate from the rest of the CRM. */
export default function TelecallingShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const [pending, setPending] = useState(0);
  useEffect(() => { api.get<{ pending: number }>("/api/crm/telecalling/approvals/count").then((r) => setPending(r.pending)).catch(() => {}); }, []);
  const tabs = [
    { to: "/telecalling/recurring", label: "Recurring customers", icon: Repeat },
    { to: "/telecalling/calls", label: "Call queue", icon: PhoneCall },
    { to: "/telecalling/approvals", label: "Offer approvals", icon: BadgeCheck, count: pending },
    { to: "/telecalling/performance", label: "Performance", icon: Trophy },
  ];
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"><Headset className="size-4" /> Telecalling</div>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => cn("-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm transition", isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <t.icon className="size-4" />{t.label}
            {!!t.count && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{t.count}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[26px] font-semibold tracking-tight">{title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p></div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
