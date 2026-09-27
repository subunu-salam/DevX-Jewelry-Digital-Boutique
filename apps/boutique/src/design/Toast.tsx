import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { EASE } from "./motion";

interface ToastItem { id: number; title: string; body?: string; image?: string | null; action?: { label: string; to: string } }
const Ctx = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(150px+env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-[var(--app-w)] flex-col items-center gap-2 px-4 md:bottom-auto md:left-auto md:right-6 md:top-24 md:items-end">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id} layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: EASE } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-night p-2.5 pr-4 text-on-night shadow-[0_20px_50px_-20px_rgba(0,0,0,.55)]"
            >
              {t.image ? <img src={t.image} alt="" className="size-12 rounded-xl object-cover" /> : <span className="flex size-10 items-center justify-center rounded-full bg-brand/25"><Check className="size-4 text-brand-soft" /></span>}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{t.title}</div>
                {t.body && <div className="truncate text-[12px] text-on-night/65">{t.body}</div>}
              </div>
              {t.action && <Link to={t.action.to} className="text-[12px] font-semibold text-brand-soft underline underline-offset-4">{t.action.label}</Link>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
