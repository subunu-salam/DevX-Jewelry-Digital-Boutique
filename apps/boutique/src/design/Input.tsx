import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@ui";

const field =
  "peer w-full rounded-xl border border-border bg-surface px-4 pb-2 pt-5 text-[14.5px] text-foreground outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-transparent focus:border-brand focus:shadow-[0_0_0_4px_rgba(168,135,78,.12)]";
const floatLabel =
  "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground transition-all duration-300 ease-[var(--ease-lux)] peer-focus:top-3 peer-focus:text-[11px] peer-focus:text-brand-deep peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:text-[11px]";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Floating-label input. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, className, id, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <div className="relative">
        <input ref={ref} id={fid} placeholder={label} className={cn(field, "h-14", error && "border-danger")} {...rest} />
        <label htmlFor={fid} className={floatLabel}>{label}</label>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
    </div>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  variant?: "field" | "inline";
}

export function Select({ label, options, variant = "field", className, ...rest }: SelectProps) {
  if (variant === "inline") {
    return (
      <label className={cn("relative inline-flex items-center gap-2 text-[13px]", className)}>
        {label && <span className="text-muted-foreground">{label}</span>}
        <select className="cursor-pointer appearance-none bg-transparent pr-5 font-semibold text-foreground outline-none" {...rest}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 size-3.5 text-muted-foreground" />
      </label>
    );
  }
  return (
    <label className={cn("relative block", className)}>
      {label && <span className="absolute left-4 top-2.5 text-[11px] text-muted-foreground">{label}</span>}
      <select className={cn(field, "h-14 cursor-pointer appearance-none pr-10")} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </label>
  );
}
