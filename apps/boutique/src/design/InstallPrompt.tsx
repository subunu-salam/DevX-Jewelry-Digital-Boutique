import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, Share, X } from "lucide-react";
import { LuxuryButton } from "./Button";
import { EASE } from "./motion";

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const KEY = "aurelia_install_dismissed";

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** "Install the app" card — native prompt on Android/Chrome/Edge, instructions on iOS Safari. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try { if (Date.now() - Number(localStorage.getItem(KEY) ?? 0) < 1000 * 60 * 60 * 24 * 14) return; } catch { /* ignore */ }
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); setTimeout(() => setOpen(true), 6000); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    let t: number | undefined;
    if (isIOS()) { setIos(true); t = window.setTimeout(() => setOpen(true), 8000); }
    const onInstalled = () => setOpen(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); if (t) clearTimeout(t); };
  }, []);

  const dismiss = () => { setOpen(false); try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } };
  const install = async () => { if (!evt) return; await evt.prompt(); await evt.userChoice.catch(() => null); setEvt(null); setOpen(false); };

  return (
    <AnimatePresence>
      {open && (evt || ios) && (
        <motion.div
          role="dialog" aria-label="Install Aurelia"
          initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } }} exit={{ opacity: 0, y: 30 }}
          className="fixed inset-x-3 bottom-[calc(92px+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-[calc(var(--app-w)-24px)] rounded-[22px] border border-border bg-surface p-4 shadow-[var(--shadow-lift)] md:bottom-28 md:left-auto md:right-6 md:mx-0"
        >
          <button onClick={dismiss} aria-label="Dismiss" className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          <div className="flex items-center gap-3 pr-6">
            <img src="/icons/icon-192.png" alt="" className="size-12 rounded-[14px]" />
            <div>
              <div className="font-serif text-[20px] leading-tight">Aurelia on your home screen</div>
              <div className="text-[12.5px] text-muted-foreground">Opens full-screen, like an app.</div>
            </div>
          </div>
          {evt ? (
            <LuxuryButton full className="mt-4" icon={<Download className="size-4" />} onClick={install}>Install app</LuxuryButton>
          ) : (
            <p className="mt-3 flex flex-wrap items-center gap-1 text-[13px] text-foreground/80">
              Tap <Share className="mx-0.5 inline size-4 text-brand-deep" /> <b>Share</b> in Safari, then <b>Add to Home Screen</b>.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
