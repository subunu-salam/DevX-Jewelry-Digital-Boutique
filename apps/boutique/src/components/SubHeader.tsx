import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export default function SubHeader({ title, to }: { title: string; to?: string }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-[54px] z-20 -mx-0 mb-1 flex items-center gap-2 bg-background/90 px-4 py-2 backdrop-blur">
      <button
        onClick={() => (to ? navigate(to) : navigate(-1))}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-surface"
        aria-label="Back"
      >
        <ChevronLeft className="size-5" />
      </button>
      <h2 className="font-serif text-[22px]">{title}</h2>
    </div>
  );
}
