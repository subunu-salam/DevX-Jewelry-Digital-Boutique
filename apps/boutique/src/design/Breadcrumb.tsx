import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3 opacity-50" />}
          {it.to ? (
            <Link to={it.to} className="transition-colors hover:text-foreground">{it.label}</Link>
          ) : (
            <span className="text-foreground/80" aria-current="page">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
