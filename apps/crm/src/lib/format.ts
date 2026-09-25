export function aed(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(value);
}
export function date(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" });
}
export function datetime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-AE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
