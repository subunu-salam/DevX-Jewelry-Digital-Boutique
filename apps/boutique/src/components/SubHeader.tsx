import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { t } from "@/design";

export default function SubHeader({ title, to }: { title: string; to?: string }) {
  const navigate = useNavigate();
  return (
    <div className="px-4 pb-3 pt-4 md:px-0 md:pt-10">
      <button onClick={() => (to ? navigate(to) : navigate(-1))} className="group inline-flex items-center gap-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground" aria-label="Back">
        <ArrowLeft className="size-4 transition-transform duration-500 group-hover:-translate-x-1" /> Back
      </button>
      <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={t(0.7)} className="mt-3 font-serif text-[36px] leading-none md:text-[52px]">
        {title}
      </motion.h1>
    </div>
  );
}
