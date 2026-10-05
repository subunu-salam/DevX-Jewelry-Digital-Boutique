import type { Transition, Variants } from "motion/react";

/** One easing curve for the whole product — a slow, confident settle. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];

export const t = (duration = 0.6, delay = 0): Transition => ({ duration, delay, ease: EASE });

/** Scroll reveal — used on section containers, not every card. */
export const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: t(0.8),
};

export const stagger = (gap = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

export const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: t(0.7) },
};

/** Masked line reveal for serif headlines. */
export const lineUp: Variants = {
  hidden: { y: "105%" },
  show: { y: "0%", transition: t(1.1) },
};

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: t(0.55) },
  exit: { opacity: 0, y: -6, transition: { duration: 0.25, ease: EASE_IN_OUT } },
};
