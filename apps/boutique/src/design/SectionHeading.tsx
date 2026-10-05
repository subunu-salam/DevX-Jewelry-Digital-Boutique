import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { cn } from "@ui";
import { reveal } from "./motion";

interface Props {
  title: React.ReactNode;
  kicker?: string;
  subtitle?: string;
  action?: { label: string; to: string };
  align?: "left" | "center";
  className?: string;
}

export function SectionHeading({ title, kicker, subtitle, action, align = "left", className }: Props) {
  return (
    <motion.div {...reveal} className={cn("mb-6 flex items-end gap-6 md:mb-9", align === "center" && "flex-col items-center text-center", className)}>
      <div className={cn("min-w-0 flex-1", align === "center" && "max-w-xl")}>
        {kicker && <div className="mb-2 font-serif text-[15px] italic text-brand-deep">{kicker}</div>}
        <h2 className="font-serif text-[30px] leading-[1.05] md:text-[44px]">{title}</h2>
        {subtitle && <p className="mt-2.5 max-w-lg text-[14px] leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      {action && (
        <Link to={action.to} className="group shrink-0 pb-1.5 text-[13px] font-semibold text-foreground">
          <span className="bg-[linear-gradient(var(--color-brand),var(--color-brand))] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-1 transition-[background-size] duration-500 group-hover:bg-[length:100%_1px]">
            {action.label}
          </span>
        </Link>
      )}
    </motion.div>
  );
}
