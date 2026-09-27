import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { cn } from "@ui";

interface Props {
  value?: string;
  onSearch?: (q: string) => void;
  placeholder?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
  className?: string;
  /** Debounce live results (catalog). Otherwise submits on Enter and routes to /catalog. */
  live?: boolean;
}

export function SearchBar({ value = "", onSearch, placeholder = "Search jewellery…", size = "md", autoFocus, className, live }: Props) {
  const [q, setQ] = useState(value);
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setQ(value), [value]);
  useEffect(() => {
    if (!live) return;
    const id = setTimeout(() => q !== value && onSearch?.(q.trim()), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, live]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) onSearch(q.trim());
    else if (q.trim()) navigate(`/catalog?search=${encodeURIComponent(q.trim())}`);
  };

  return (
    <form role="search" onSubmit={submit} className={cn("group relative flex items-center", className)}>
      <Search className={cn("pointer-events-none absolute left-4 text-muted-foreground transition-colors group-focus-within:text-brand-deep", size === "lg" ? "size-5" : "size-4")} />
      <input
        ref={ref}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="Search jewellery"
        enterKeyHint="search"
        className={cn(
          "w-full rounded-full border border-border bg-surface pl-11 pr-10 text-foreground outline-none transition-[border-color,box-shadow] duration-500 placeholder:text-muted-foreground/80 focus:border-brand-soft focus:shadow-[0_8px_30px_-16px_rgba(134,104,58,.45)]",
          size === "lg" ? "h-14 text-[15.5px]" : "h-11 text-[14px]",
        )}
      />
      {q && (
        <button type="button" aria-label="Clear" onClick={() => { setQ(""); onSearch?.(""); ref.current?.focus(); }} className="absolute right-3 rounded-full p-1 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      )}
    </form>
  );
}
