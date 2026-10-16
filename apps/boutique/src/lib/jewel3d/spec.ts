/**
 * A description of a piece that the 3D generator can build. Derived from catalogue data
 * (category, metal colour, stone, name/tags) so every product gets a 3D model without
 * a 3D artist — e.g. "Oval Halo Ring, 18K White, Diamond" → oval centre stone, halo, white gold.
 */
export type JewelKind =
  | "ring"
  | "stud" | "drop" | "hoop"                                   // earrings
  | "pendant" | "riviere" | "pearlStrand" | "choker" | "chain" // necklaces
  | "bangle" | "tennis" | "linkBracelet";                     // bracelets

export const isEarring = (k: JewelKind) => k === "stud" || k === "drop" || k === "hoop";
export const isNeck = (k: JewelKind) => k === "pendant" || k === "riviere" || k === "pearlStrand" || k === "choker" || k === "chain";
export const isWrist = (k: JewelKind) => k === "bangle" || k === "tennis" || k === "linkBracelet";
export type Metal = "yellow" | "white" | "rose";
export type GemKey = "diamond" | "ruby" | "sapphire" | "emerald" | "morganite" | "amethyst" | "citrine" | "aquamarine" | "pearl";
export type Shape = "round" | "oval" | "cushion" | "emerald" | "pear";
export type Style = "solitaire" | "halo" | "pave" | "halo-pave" | "trilogy" | "plain";

export interface JewelSpec {
  kind: JewelKind;
  metal: Metal;
  gem: GemKey | null;
  shape: Shape;
  style: Style;
  /** centre stone width in mm */
  stoneMm: number;
  /** special motifs: jhumka bell, evil-eye enamel */
  motif?: "jhumka" | "evil-eye" | null;
}

export const GEMS: Record<GemKey, { label: string; color: string; ior: number; dispersion: number; atten: number }> = {
  diamond: { label: "Diamond", color: "#ffffff", ior: 2.42, dispersion: 4.5, atten: 40 },
  ruby: { label: "Ruby", color: "#e0113a", ior: 1.77, dispersion: 1.2, atten: 2.2 },
  sapphire: { label: "Sapphire", color: "#1e46d6", ior: 1.77, dispersion: 1.2, atten: 2.2 },
  emerald: { label: "Emerald", color: "#0f9a52", ior: 1.58, dispersion: 0.8, atten: 2.6 },
  morganite: { label: "Morganite", color: "#f5a3b8", ior: 1.58, dispersion: 0.8, atten: 4 },
  amethyst: { label: "Amethyst", color: "#8e4fd6", ior: 1.54, dispersion: 0.8, atten: 3 },
  citrine: { label: "Citrine", color: "#f3b33d", ior: 1.54, dispersion: 0.8, atten: 3.5 },
  aquamarine: { label: "Aquamarine", color: "#7fd3e6", ior: 1.58, dispersion: 0.8, atten: 5 },
  pearl: { label: "Pearl", color: "#f3ece6", ior: 1.5, dispersion: 0, atten: 0 },
};
export const METALS: Record<Metal, { label: string; color: string }> = {
  yellow: { label: "Yellow gold", color: "#f0c766" },
  white: { label: "White gold", color: "#e9ebee" },
  rose: { label: "Rose gold", color: "#f1ad93" },
};

interface ProductLike {
  name: string; metalColor?: string | null; stoneType?: string | null; tags?: string[];
  category?: { slug: string } | string | null; tryOn?: { type: string } | null;
}

export function specFromProduct(p: ProductLike): JewelSpec | null {
  const cat = typeof p.category === "string" ? p.category : p.category?.slug ?? "";
  const words = `${p.name} ${(p.tags ?? []).join(" ")} ${cat} ${p.stoneType ?? ""}`.toLowerCase();
  const has = (...k: string[]) => k.some((w) => words.includes(w));
  const t = p.tryOn?.type ?? "";
  // category decides first ("earrings" contains "ring"), then try-on type, then name/tag words
  const c = cat.toLowerCase();
  const byCat = c.startsWith("earring") ? "ear" : c.startsWith("ring") ? "ring" : /pendant|necklace|chain/.test(c) ? "neck" : /bracelet|bangle/.test(c) ? "wrist" : "";
  const nameHas = (...k: string[]) => k.some((w) => new RegExp(`\\b${w}`).test(words.replace(/earrings?/g, "")));
  const by = byCat || (t === "ring" ? "ring" : t === "earrings" ? "ear" : t === "pendant" || t === "necklace" ? "neck" : t === "bracelet" ? "wrist" : "")
    || (has("earring", "stud", "hoop", "jhumka") ? "ear" : has("pendant", "necklace", "choker", "riviere", "rivière", "strand", "chain") ? "neck"
      : has("bangle", "bracelet", "cuff", "kada") ? "wrist" : nameHas("ring", "band") ? "ring" : "");
  const isRing = by === "ring", isEar = by === "ear", isNeckP = by === "neck", isWristP = by === "wrist";
  const kind: JewelKind | null =
    isRing ? "ring"
      : isEar ? (has("hoop", "huggie") ? "hoop" : has("drop", "dangle", "chandelier", "jhumka") ? "drop" : "stud")
        : isNeckP ? (t === "pendant" || has("pendant", "evil-eye", "evil eye", "locket") ? "pendant"
          : has("riviere", "rivière", "tennis") ? "riviere" : has("pearl") ? "pearlStrand" : has("choker", "collar") ? "choker"
            : has("chain") ? "chain" : "pendant")
          : isWristP ? (has("tennis", "riviere") ? "tennis" : has("chain", "link") ? "linkBracelet" : "bangle") : null;
  if (!kind) return null;
  const mc = (p.metalColor ?? "").toLowerCase();
  const metal: Metal = mc.includes("rose") ? "rose" : mc.includes("white") || mc.includes("platinum") || mc.includes("silver") ? "white" : "yellow";
  const st = (p.stoneType ?? "").toLowerCase();
  const gemWords = words.replace(/emerald[- ]cut/g, "");
  const gemIn = (txt: string): GemKey | null =>
    txt.includes("pearl") ? "pearl" : txt.includes("ruby") ? "ruby" : txt.includes("sapphire") ? "sapphire" : txt.includes("emerald") ? "emerald"
      : txt.includes("morganite") || txt.includes("pink") ? "morganite" : txt.includes("amethyst") ? "amethyst" : txt.includes("citrine") ? "citrine"
        : txt.includes("aquamarine") ? "aquamarine" : txt.includes("diamond") || txt.includes("solitaire") || txt.includes("brilliant") || txt.includes("riviere") || txt.includes("rivière") || txt.includes("tennis") ? "diamond" : null;
  const motif = has("evil-eye", "evil eye") ? "evil-eye" as const : has("jhumka") ? "jhumka" as const : null;
  const plainMetal = st === "" && (has("22k", "band", "plain", "filigree", "cuff", "heritage") || ["bangle", "chain", "linkBracelet", "hoop", "choker"].includes(kind));
  const gem: GemKey | null = motif ? null : gemIn(st) ?? gemIn(gemWords) ?? (plainMetal ? null : kind === "ring" || kind === "stud" || kind === "drop" || kind === "pendant" || kind === "riviere" || kind === "tennis" ? "diamond" : null);
  const shape: Shape = has("oval") ? "oval" : has("cushion") ? "cushion" : has("emerald cut", "emerald-cut", "baguette") ? "emerald" : has("pear", "drop") ? "pear" : "round";
  const halo = has("halo"), pave = has("pave", "pavé", "eternity", "tennis");
  const style: Style = gem === null ? "plain" : has("trilogy", "three stone", "three-stone") ? "trilogy" : halo && pave ? "halo-pave" : halo ? "halo" : pave ? "pave"
    : kind === "pendant" && !has("solitaire") ? "halo" : "solitaire";
  const stoneMm = kind === "ring" ? (has("cocktail") ? 9 : 6.5) : kind === "stud" ? 5.5 : kind === "drop" ? 7 : kind === "pendant" ? 8 : kind === "pearlStrand" ? 7 : 3;
  return { kind, metal, gem, shape, style, stoneMm: has("0.5ct", "0.5 ct") ? 5.2 : stoneMm, motif };
}
