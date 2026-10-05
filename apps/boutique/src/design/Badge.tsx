import { cn } from "@ui";

type Tone = "new" | "gold" | "neutral" | "ok" | "dark";
const tones: Record<Tone, string> = {
  new: "bg-surface/95 text-foreground border-border",
  gold: "bg-brand/10 text-brand-deep border-brand/30",
  neutral: "bg-muted text-muted-foreground border-transparent",
  ok: "bg-ok/10 text-ok border-ok/25",
  dark: "bg-ink/85 text-[#F7F2E8] border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[10.5px] font-semibold tracking-[0.06em] backdrop-blur", tones[tone], className)}>
      {children}
    </span>
  );
}
