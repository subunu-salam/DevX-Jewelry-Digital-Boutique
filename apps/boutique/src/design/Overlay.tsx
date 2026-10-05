import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@ui";
import { EASE } from "./motion";

function useLockScroll(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
}

const Scrim = ({ onClick }: { onClick: () => void }) => (
  <motion.div
    className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[3px]"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: 0.4 }}
    onClick={onClick}
  />
);

interface OverlayProps { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; className?: string }

/** Centered on desktop, a bottom sheet on phones. */
export function Modal({ open, onClose, title, children, className }: OverlayProps) {
  useLockScroll(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Scrim onClick={onClose} />
          <div className="pointer-events-none fixed inset-0 z-[90] flex items-end justify-center md:items-center md:p-6">
            <motion.div
              role="dialog" aria-modal="true" aria-label={title}
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: EASE } }}
              exit={{ opacity: 0, y: 30, transition: { duration: 0.25 } }}
              className={cn("pointer-events-auto max-h-[90dvh] w-full max-w-[var(--app-w)] overflow-y-auto rounded-t-[28px] bg-surface p-6 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-2xl md:max-w-lg md:rounded-[28px] md:pb-6", className)}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                {title && <h3 className="font-serif text-[28px] leading-tight">{title}</h3>}
                <button onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
              </div>
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Side drawer (desktop) that becomes a bottom sheet on phones. */
export function Drawer({ open, onClose, title, children, side = "right", footer }: OverlayProps & { side?: "left" | "right"; footer?: React.ReactNode }) {
  useLockScroll(open, onClose);
  const fromX = side === "right" ? "100%" : "-100%";
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Scrim onClick={onClose} />
          <motion.aside
            role="dialog" aria-modal="true" aria-label={title}
            initial={{ x: fromX }} animate={{ x: 0, transition: { duration: 0.6, ease: EASE } }} exit={{ x: fromX, transition: { duration: 0.35, ease: EASE } }}
            className={cn("fixed inset-y-0 z-[90] hidden w-[400px] max-w-[92vw] flex-col bg-surface shadow-2xl md:flex", side === "right" ? "right-0" : "left-0")}
          >
            <DrawerBody title={title} onClose={onClose} footer={footer}>{children}</DrawerBody>
          </motion.aside>
          <motion.aside
            role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: "100%" }} animate={{ y: 0, transition: { duration: 0.55, ease: EASE } }} exit={{ y: "100%", transition: { duration: 0.3 } }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 120 || i.velocity.y > 600) onClose(); }}
            className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[88dvh] max-w-[var(--app-w)] flex-col rounded-t-[28px] bg-surface shadow-2xl md:hidden"
          >
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border-secondary" />
            <DrawerBody title={title} onClose={onClose} footer={footer}>{children}</DrawerBody>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function DrawerBody({ title, onClose, children, footer }: { title?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h3 className="font-serif text-[26px]">{title}</h3>
        <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {footer && <div className="border-t border-border px-6 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">{footer}</div>}
    </>
  );
}
