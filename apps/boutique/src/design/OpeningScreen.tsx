import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { LuxuryButton } from "./Button";
import { EASE, stagger } from "./motion";

const KEY = "aurelia_opened";

const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE } } };

/**
 * First impression: shown once per visit. Signature piece in an arch, the monogram and
 * wordmark, one line of copy, "Enter the boutique". Leaves by lifting away like a curtain.
 */
export function OpeningScreen({ image }: { image?: string | null }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => {
    try { return !sessionStorage.getItem(KEY); } catch { return false; }
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const close = (to?: string) => {
    try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
    if (to) navigate(to);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Aurelia"
          initial={{ opacity: 1 }}
          exit={{ clipPath: "inset(0% 0% 100% 0%)", transition: { duration: 0.9, ease: [0.65, 0, 0.35, 1] } }}
          style={{ clipPath: "inset(0% 0% 0% 0%)" }}
          className="fixed inset-y-0 left-0 right-0 z-[150] mx-auto flex max-w-[var(--app-w)] flex-col items-center justify-between bg-background px-7 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[calc(56px+env(safe-area-inset-top))]"
        >
          <motion.div variants={stagger(0.14, 0.2)} initial="hidden" animate="show" className="contents">
            <motion.div variants={item} className="text-[10px] font-semibold uppercase tracking-[0.34em] text-brand-deep">
              Dubai · Abu Dhabi
            </motion.div>

            <div className="flex flex-col items-center gap-5">
              <motion.div variants={item} className="relative w-[62%] max-w-[240px] border border-brand/45 p-2" style={{ borderRadius: "999px 999px 24px 24px" }}>
                <motion.div
                  initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
                  animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
                  transition={{ duration: 1.4, ease: EASE, delay: 0.3 }}
                  className="relative aspect-[4/5] overflow-hidden bg-champagne"
                  style={{ borderRadius: "999px 999px 18px 18px" }}
                >
                  {image ? (
                    <motion.img src={image} alt="" initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 3, ease: EASE }} className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <div className="skeleton absolute inset-0" />
                  )}
                </motion.div>
              </motion.div>

              <motion.div variants={item} className="flex flex-col items-center gap-3">
                <span aria-hidden className="relative flex size-[52px] items-center justify-center rounded-full border border-brand/70 font-serif text-[28px] italic text-brand-deep">
                  A<span className="absolute inset-[3px] rounded-full border border-brand/25" />
                </span>
                <span className="pl-[0.26em] font-serif text-[40px] font-semibold uppercase leading-none tracking-[0.26em]">Aurelia</span>
                <span className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.34em] text-brand-deep">
                  <span className="h-px w-[18px] bg-brand" />Fine Jewellery<span className="h-px w-[18px] bg-brand" />
                </span>
              </motion.div>

              <motion.p variants={item} className="text-center font-serif text-[21px] italic text-muted-foreground">
                Heirlooms, made by hand.
              </motion.p>
            </div>

            <motion.div variants={item} className="flex w-full flex-col items-center gap-4">
              <LuxuryButton size="lg" full onClick={() => close()} iconRight={<ArrowRight className="size-4" />}>
                Enter the boutique
              </LuxuryButton>
              <button onClick={() => close("/appointments")} className="text-[12.5px] font-semibold text-foreground underline decoration-brand underline-offset-[6px]">
                Book a private viewing
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
