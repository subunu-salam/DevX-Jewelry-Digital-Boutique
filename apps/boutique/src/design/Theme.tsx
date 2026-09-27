import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@ui";

type Theme = "light" | "dark";
const KEY = "aurelia_theme";
const META = { light: "#F7F2E8", dark: "#13110E" };

const Ctx = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>({ theme: "light", toggle: () => {}, setTheme: () => {} });
export const useTheme = () => useContext(Ctx);

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* ignore */ }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META[theme]);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initial);

  useEffect(() => { apply(theme); }, [theme]);

  // Follow the device setting until the user picks one explicitly.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => {
      try { if (localStorage.getItem(KEY)) return; } catch { /* ignore */ }
      setThemeState(e.matches ? "dark" : "light");
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
    window.setTimeout(() => root.classList.remove("theme-switching"), 600);
  }, []);
  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <Ctx.Provider value={{ theme, toggle, setTheme }}>{children}</Ctx.Provider>;
}

/** Sun/moon switch — the icon rotates out and the other rotates in. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={cn("relative inline-flex size-10 items-center justify-center overflow-hidden rounded-full border border-border bg-surface/80 text-foreground/80 transition-colors duration-500 hover:border-foreground/40 hover:text-foreground active:scale-95", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 18, rotate: -90, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          exit={{ y: -18, rotate: 90, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex"
        >
          {dark ? <Sun className="size-[17px]" strokeWidth={1.7} /> : <Moon className="size-[17px]" strokeWidth={1.7} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
