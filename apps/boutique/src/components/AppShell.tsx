import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion, useScroll, useSpring } from "motion/react";
import { InstallPrompt, Navbar, TabBar, ThemeProvider, ToastProvider, pageVariants } from "@/design";

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return <motion.div style={{ scaleX }} className="fixed inset-x-0 top-0 z-[60] mx-auto h-[2px] max-w-[var(--app-w)] origin-left bg-brand/70" />;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [location.pathname]);

  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <div className="min-h-dvh bg-backdrop transition-colors duration-500">
          <div className="app-frame grain relative mx-auto flex min-h-dvh w-full max-w-[var(--app-w)] flex-col bg-background text-foreground shadow-[0_0_80px_-30px_rgba(0,0,0,.45)]">
            <ScrollProgress />
            <Navbar />
            <AnimatePresence mode="wait">
              <motion.main key={location.pathname} variants={pageVariants} initial="initial" animate="enter" exit="exit" className="relative z-[1] flex-1 pb-[calc(104px+env(safe-area-inset-bottom))]">
                {children}
              </motion.main>
            </AnimatePresence>
            <TabBar />
            <InstallPrompt />
          </div>
          </div>
        </ToastProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
