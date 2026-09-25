import { cn } from "@ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-border bg-card", className)}>{children}</div>;
}

export function Button({
  children, onClick, variant = "primary", size = "md", type = "button", disabled, className,
}: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md"; type?: "button" | "submit"; disabled?: boolean; className?: string;
}) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-8px_rgba(212,175,106,0.5)]",
    outline: "border border-border bg-card hover:bg-muted",
    ghost: "hover:bg-muted",
    danger: "bg-danger text-danger-bg hover:opacity-90",
  };
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50", variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  );
}

export function Input({ value, onChange, placeholder, type = "text", className }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary", className)}
    />
  );
}

export function Select({ value, onChange, children, className }: {
  value: string; onChange: (v: string) => void; children: ReactNode; className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary", className)}>
      {children}
    </select>
  );
}

const STATUS_STYLES: Record<string, string> = {
  // inquiry
  NEW: "bg-info-bg text-info",
  QUALIFIED: "bg-warning-bg text-warning",
  QUOTED: "bg-info-bg text-info",
  APPOINTMENT: "bg-warning-bg text-warning",
  CONVERTED: "bg-success-bg text-success",
  LOST: "bg-danger-bg text-danger",
  // appt / quote / invoice
  REQUESTED: "bg-warning-bg text-warning",
  CONFIRMED: "bg-info-bg text-info",
  COMPLETED: "bg-success-bg text-success",
  CANCELLED: "bg-danger-bg text-danger",
  NO_SHOW: "bg-danger-bg text-danger",
  DRAFT: "bg-muted text-muted-foreground",
  SENT: "bg-info-bg text-info",
  ACCEPTED: "bg-success-bg text-success",
  REJECTED: "bg-danger-bg text-danger",
  EXPIRED: "bg-muted text-muted-foreground",
  ISSUED: "bg-info-bg text-info",
  PAID: "bg-success-bg text-success",
  PARTIAL: "bg-warning-bg text-warning",
  ACTIVE: "bg-success-bg text-success",
  WARNING: "bg-warning-bg text-warning",
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const style = tone ? STATUS_STYLES[tone] ?? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", style)}>{children}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn("w-full rounded-xl border border-border bg-card shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">{message}</div>;
}
