export function aed(value: number | null | undefined): string {
  if (value == null) return "On request";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(value);
}

export function priceLabel(p: { priceMode: string; basePrice: number; discount?: number }): string {
  if (p.priceMode === "INQUIRY") return "Price on inquiry";
  const price = p.discount ? p.basePrice * (1 - p.discount / 100) : p.basePrice;
  return aed(price);
}
