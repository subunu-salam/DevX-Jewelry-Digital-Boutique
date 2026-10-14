import { useEffect, useState } from "react";
import { api } from "./api";

export type Segment = "ONE_TIME" | "SECOND_TIME" | "RECURRING" | "CONTINUOUS";
export const SEGMENT_LABEL: Record<Segment, string> = { ONE_TIME: "First-time", SECOND_TIME: "Second-time", RECURRING: "Recurring (3+)", CONTINUOUS: "Continuous" };
export const SEGMENT_HINT: Record<Segment, string> = {
  ONE_TIME: "Bought once — nudge to a second visit",
  SECOND_TIME: "Bought twice — becoming a regular",
  RECURRING: "Bought 3+ times",
  CONTINUOUS: "Buys on a steady rhythm",
};

export interface RecurringLead {
  id: string; name: string; phone: string | null; branch: string | null; tier: string;
  segment: Segment; orders: number; cycleDays: number; daysSince: number | null; overdueBy: number;
  lastPurchase: string | null; lastItem: string | null; lifetimeSpend: number;
  spendLast3m: number; spendPrev3m: number; trend: "UP" | "DOWN" | "STEADY" | "NEW"; trendPct: number | null;
  alert: boolean; alertText: string; priority: "HIGH" | "MEDIUM" | "LOW"; openCall: boolean; script: string;
}
export interface RecurringReport {
  source: "live" | "demo"; note: string | null;
  kpis: { clients: number; repeatRate: number; alerts: number; highPriority: number; trendingDown: number; trendingUp: number; planDues: number };
  segments: { segment: Segment; label: string; count: number; alerts: number; spend: number }[];
  leads: RecurringLead[];
  planDues: { planId: string; reference: string; customerId: string; name: string; phone: string | null; monthlyAmount: number; missed: number; paid: number; tenure: number }[];
}

export interface OfferType { label: string; unit: string; autoLimit: number; max: number }
export interface TeleConfig { offerTypes: Record<string, OfferType>; lostReasons: string[] }
let cfg: TeleConfig | null = null;
export function useTeleConfig() {
  const [c, setC] = useState<TeleConfig | null>(cfg);
  useEffect(() => { if (!cfg) api.get<TeleConfig>("/api/crm/telecalling/config").then((x) => { cfg = x; setC(x); }).catch(() => {}); }, []);
  return c;
}
export const offerText = (type: string, value: number, cfgx?: TeleConfig | null) => {
  const t = cfgx?.offerTypes[type];
  if (!t) return `${type} ${value}`;
  return t.unit === "%" ? `${value}% · ${t.label.toLowerCase()}` : t.unit === "days" ? `${t.label} for ${value} days` : `${t.label} worth AED ${value.toLocaleString()}`;
};

export interface Offer {
  id: string; reference: string; callTaskId: string | null; customerId: string | null; customerName: string; customerPhone: string | null;
  type: string; value: number; reason: string; status: "PENDING" | "APPROVED" | "REJECTED" | "REDEEMED" | "EXPIRED"; autoApproved: boolean;
  requestedBy: string | null; decidedBy: string | null; decisionNote: string | null; decidedAt: string | null; validUntil: string | null;
  code: string | null; redeemedAt: string | null; redeemedAmount: number | null; createdAt: string;
  callTask?: { reason: string; lostReason: string | null; feedback: string | null; tier: string | null; segment: string | null } | null;
}
