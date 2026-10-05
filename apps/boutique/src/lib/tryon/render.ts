/**
 * Renders a lifelike likeness of a piece as SVG, from its catalogue attributes
 * (type, metal colour, stone, and style words in its name/tags). Used when a piece has no
 * staff cut-out and its photo can't be cut out (e.g. worn by a model), so every piece can be
 * tried on. Labelled in the UI as a "rendered likeness".
 */
import type { TryOnType } from "./engine";

export interface Fit {
  /** "top": the asset's top edge hangs from the anchor (necklaces, earrings); "center": centred on it. */
  anchor: "top" | "center";
  /** Multiplier on the body-measured base width (see engine.place). */
  k: number;
  /** Necklace/pendant drop height relative to the base (choker sits higher). */
  drop?: number;
}

export interface Rendered { src: string; aspect: number; fit: Fit }

interface Piece {
  name: string;
  metalColor: string;
  stoneType?: string | null;
  tags?: string[];
  category?: { slug: string } | null;
}

/* ── Palettes ─────────────────────────────────────────────── */

const METAL: Record<string, string[]> = {
  yellow: ["#7a5512", "#e9c35f", "#fff3c4", "#c8962c", "#8a6416"],
  white: ["#7d8288", "#e3e7ec", "#ffffff", "#b4bac2", "#868c94"],
  rose: ["#86493a", "#e7ab8f", "#ffe3d6", "#c47c63", "#91533f"],
};
const GEM: Record<string, { c: string[]; glow: string }> = {
  diamond: { c: ["#ffffff", "#eef4fb", "#a9bdd6", "#56688a"], glow: "#ffffff" },
  emerald: { c: ["#9ff0c4", "#2bb673", "#0f7a4a", "#06402a"], glow: "#b8ffd9" },
  ruby: { c: ["#ff9bab", "#e2294b", "#9b0c26", "#4f0412"], glow: "#ffc2cc" },
  sapphire: { c: ["#a9c2ff", "#3a66e0", "#173b9a", "#0a1d55"], glow: "#cfe0ff" },
  pearl: { c: ["#ffffff", "#f7efe6", "#e7d9cc", "#cdbbad"], glow: "#fff7f0" },
};

const metalKey = (c: string) => (/rose/i.test(c) ? "rose" : /white|platinum|silver/i.test(c) ? "white" : "yellow");
const gemKey = (s?: string | null) => {
  const v = (s ?? "").toLowerCase();
  if (v.includes("emerald")) return "emerald";
  if (v.includes("ruby")) return "ruby";
  if (v.includes("sapphire")) return "sapphire";
  if (v.includes("pearl")) return "pearl";
  if (v.includes("diamond") || v.includes("brilliant")) return "diamond";
  return null;
};

function defs(metal: string[], gem: { c: string[]; glow: string } | null) {
  return `<defs>
<linearGradient id="m" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${metal[0]}"/><stop offset=".3" stop-color="${metal[1]}"/><stop offset=".5" stop-color="${metal[2]}"/><stop offset=".72" stop-color="${metal[3]}"/><stop offset="1" stop-color="${metal[4]}"/>
</linearGradient>
<linearGradient id="mv" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${metal[2]}"/><stop offset=".45" stop-color="${metal[1]}"/><stop offset="1" stop-color="${metal[4]}"/>
</linearGradient>
${gem ? `<radialGradient id="g" cx=".38" cy=".32" r=".75">
<stop offset="0" stop-color="${gem.c[0]}"/><stop offset=".35" stop-color="${gem.c[1]}"/><stop offset=".75" stop-color="${gem.c[2]}"/><stop offset="1" stop-color="${gem.c[3]}"/>
</radialGradient>` : ""}
<radialGradient id="p" cx=".35" cy=".3" r=".8">
<stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#f6eee6"/><stop offset=".8" stop-color="#e3d2c4"/><stop offset="1" stop-color="#c9b4a4"/>
</radialGradient>
<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#000" flood-opacity=".35"/></filter>
</defs>`;
}

/* ── Primitives ───────────────────────────────────────────── */

type P = { x: number; y: number };
const bez = (t: number, a: P, b: P, c: P, d: P): P => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};
const f = (n: number) => n.toFixed(1);

let DARK = "#56688a";
let LINE = "#c8962c";

/** A round brilliant (or coloured stone): crown facets, table and a sparkle. */
function stone(x: number, y: number, r: number, gemOn: boolean) {
  const fill = gemOn ? "url(#g)" : "url(#m)";
  let facets = "";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    facets += `<line x1="${f(x + Math.cos(a) * r * 0.45)}" y1="${f(y + Math.sin(a) * r * 0.45)}" x2="${f(x + Math.cos(a) * r * 0.98)}" y2="${f(y + Math.sin(a) * r * 0.98)}" stroke="${DARK}" stroke-opacity=".55" stroke-width="${f(Math.max(0.5, r * 0.07))}"/>`;
  }
  const oct = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return `${f(x + Math.cos(a) * r * 0.48)},${f(y + Math.sin(a) * r * 0.48)}`; }).join(" ");
  return `<g><circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 1.14)}" fill="url(#m)"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}" stroke="${DARK}" stroke-opacity=".6" stroke-width="${f(Math.max(0.5, r * 0.06))}"/>${facets}<polygon points="${oct}" fill="#fff" fill-opacity=".35" stroke="${DARK}" stroke-opacity=".45" stroke-width="${f(Math.max(0.4, r * 0.05))}"/>${sparkle(x - r * 0.3, y - r * 0.35, r * 0.6)}</g>`;
}
function sparkle(x: number, y: number, s: number) {
  return `<path d="M${f(x)},${f(y - s)} L${f(x + s * 0.18)},${f(y - s * 0.18)} L${f(x + s)},${f(y)} L${f(x + s * 0.18)},${f(y + s * 0.18)} L${f(x)},${f(y + s)} L${f(x - s * 0.18)},${f(y + s * 0.18)} L${f(x - s)},${f(y)} L${f(x - s * 0.18)},${f(y - s * 0.18)}Z" fill="#fff" fill-opacity=".85"/>`;
}
function pearl(x: number, y: number, r: number) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#p)"/><circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.38)}" r="${f(r * 0.28)}" fill="#fff" fill-opacity=".9"/>`;
}
function emeraldCut(x: number, y: number, w: number, h: number) {
  const c = Math.min(w, h) * 0.22;
  const pts = `${f(x - w / 2 + c)},${f(y - h / 2)} ${f(x + w / 2 - c)},${f(y - h / 2)} ${f(x + w / 2)},${f(y - h / 2 + c)} ${f(x + w / 2)},${f(y + h / 2 - c)} ${f(x + w / 2 - c)},${f(y + h / 2)} ${f(x - w / 2 + c)},${f(y + h / 2)} ${f(x - w / 2)},${f(y + h / 2 - c)} ${f(x - w / 2)},${f(y - h / 2 + c)}`;
  return `<g><polygon points="${pts}" fill="url(#m)" transform="translate(${f(x)} ${f(y)}) scale(1.12) translate(${f(-x)} ${f(-y)})"/><polygon points="${pts}" fill="url(#g)"/><rect x="${f(x - w * 0.28)}" y="${f(y - h * 0.3)}" width="${f(w * 0.56)}" height="${f(h * 0.6)}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>${sparkle(x - w * 0.18, y - h * 0.22, Math.min(w, h) * 0.3)}</g>`;
}

const svg = (w: number, h: number, body: string, d: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}">${d}<g filter="url(#s)">${body}</g></svg>`;
const toUrl = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;

/* ── Pieces ───────────────────────────────────────────────── */

export function renderLikeness(type: TryOnType, piece: Piece): Rendered {
  const words = `${piece.name} ${(piece.tags ?? []).join(" ")} ${piece.category?.slug ?? ""}`.toLowerCase();
  const has = (...k: string[]) => k.some((w) => words.includes(w));
  const metal = METAL[metalKey(piece.metalColor)];
  const gk = gemKey(piece.stoneType) ?? (has("pearl") ? "pearl" : has("diamond") ? "diamond" : null);
  const gem = gk ? GEM[gk] : null;
  const D = defs(metal, gem);
  DARK = gem ? gem.c[3] : metal[4];
  LINE = metal[3];
  const enamel = /enamel/i.test(piece.stoneType ?? "") || has("evil-eye", "evil eye");

  /* Necklace: a U drape; top ends sit at the sides of the neck. */
  if (type === "necklace") {
    const W = 400;
    const choker = has("choker", "collar");
    const H = choker ? 150 : 300;
    const a = { x: 30, y: 8 }, b = { x: 70, y: choker ? 100 : 190 }, c = { x: 150, y: choker ? 138 : 262 }, d = { x: 200, y: choker ? 138 : 262 };
    const b2 = { x: 250, y: c.y }, c2 = { x: 330, y: b.y }, d2 = { x: 370, y: 8 };
    const path = `M${a.x},${a.y} C${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y} C${b2.x},${b2.y} ${c2.x},${c2.y} ${d2.x},${d2.y}`;
    const along = (t: number) => (t <= 0.5 ? bez(t * 2, a, b, c, d) : bez((t - 0.5) * 2, d, b2, c2, d2));
    let body = "";
    if (choker) {
      body += `<path d="${path}" fill="none" stroke="url(#mv)" stroke-width="26" stroke-linecap="round"/>`;
      body += `<path d="${path}" fill="none" stroke="${metal[4]}" stroke-opacity=".55" stroke-width="22" stroke-dasharray="3 7"/>`;
      body += `<path d="${path}" fill="none" stroke="${metal[2]}" stroke-opacity=".7" stroke-width="2" transform="translate(0 -9)"/>`;
      for (let i = 1; i < 12; i++) { const p = along(0.18 + (i / 12) * 0.64); body += `<circle cx="${f(p.x)}" cy="${f(p.y + 16)}" r="5" fill="url(#m)"/>`; }
    } else if (gk === "pearl" || has("strand")) {
      body += `<path d="${path}" fill="none" stroke="${metal[3]}" stroke-width="1.5"/>`;
      const n = 30;
      for (let i = 0; i <= n; i++) { const p = along(0.03 + (i / n) * 0.94); body += i % 3 === 2 ? `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="5" fill="url(#m)"/>` : pearl(p.x, p.y, 8.5); }
    } else if (gem && has("riviere", "rivière", "tennis", "line")) {
      body += `<path d="${path}" fill="none" stroke="url(#m)" stroke-width="3"/>`;
      const n = 26;
      for (let i = 0; i <= n; i++) { const t = 0.12 + (i / n) * 0.76; const p = along(t); const grad = 1 - Math.abs(t - 0.5) * 1.3; body += stone(p.x, p.y, 5 + grad * 6, true); }
    } else {
      body += `<path d="${path}" fill="none" stroke="url(#m)" stroke-width="5" stroke-linecap="round"/>`;
      body += `<path d="${path}" fill="none" stroke="${metal[4]}" stroke-width="5" stroke-dasharray="5 4" stroke-opacity=".6"/>`;
      if (gem) body += stone(200, 262 + 14, 14, true);
    }
    return { src: toUrl(svg(W, H + (choker ? 0 : 30), body, D)), aspect: W / (H + (choker ? 0 : 30)), fit: { anchor: "top", k: 1.12, drop: choker ? 0.3 : 0.42 } };
  }

  /* Pendant: fine chain in a V with the pendant at the point. */
  if (type === "pendant") {
    const W = 300, H = 330;
    const chain = `M40,6 C82,150 124,226 150,236 C176,226 218,150 260,6`;
    let body = `<path d="${chain}" fill="none" stroke="url(#m)" stroke-width="2.4"/>`;
    body += `<ellipse cx="150" cy="244" rx="4.5" ry="7" fill="none" stroke="url(#m)" stroke-width="2.6"/>`;
    if (enamel) {
      body += `<circle cx="150" cy="276" r="25" fill="url(#m)"/><circle cx="150" cy="276" r="21" fill="#1d3f8f"/><circle cx="150" cy="276" r="15" fill="#f4f7ff"/><circle cx="150" cy="276" r="10" fill="#5aa7e8"/><circle cx="150" cy="276" r="5" fill="#0b0f1a"/><circle cx="146" cy="272" r="2" fill="#fff"/>`;
    } else if (has("ginkgo", "leaf")) {
      body += `<path d="M150,252 C120,262 108,292 116,312 Q150,300 184,312 C192,292 180,262 150,252Z" fill="url(#m)"/><path d="M150,254 L150,306 M150,262 L130,302 M150,262 L170,302" stroke="${metal[4]}" stroke-opacity=".5" stroke-width="1.2"/>`;
    } else if (gem) {
      body += `<path d="M144,250 L156,250 L153,258 L147,258Z" fill="url(#m)"/>` + stone(150, 274, 16, true);
    } else {
      body += `<path d="M150,250 C134,268 136,300 150,314 C164,300 166,268 150,250Z" fill="url(#m)"/>`;
    }
    return { src: toUrl(svg(W, H, body, D)), aspect: W / H, fit: { anchor: "top", k: 1.15, drop: 0.42 } };
  }

  /* Earrings: one earring; the studio mirrors it for the other ear. */
  if (type === "earrings") {
    if (has("hoop")) {
      const body = `<circle cx="50" cy="62" r="40" fill="none" stroke="url(#m)" stroke-width="7"/><circle cx="50" cy="62" r="40" fill="none" stroke="${metal[2]}" stroke-opacity=".7" stroke-width="1.5" transform="translate(-1.5 -1.5)"/>`;
      return { src: toUrl(svg(100, 108, body, D)), aspect: 100 / 108, fit: { anchor: "top", k: 1.4 } };
    }
    if (has("jhumka", "bell")) {
      let body = stone(45, 14, 10, !!gem) + `<line x1="45" y1="26" x2="45" y2="52" stroke="${LINE}" stroke-width="2.5"/>`;
      body += `<path d="M45,52 C20,60 12,96 10,118 L80,118 C78,96 70,60 45,52Z" fill="url(#mv)"/><path d="M14,112 L76,112" stroke="${metal[4]}" stroke-width="2" stroke-dasharray="3 3"/>`;
      body += `<path d="M30,70 Q45,64 60,70" fill="none" stroke="${metal[4]}" stroke-opacity=".5" stroke-width="1.5"/>`;
      for (let i = 0; i < 8; i++) { const x = 14 + i * 9; body += `<line x1="${x}" y1="118" x2="${x}" y2="130" stroke="${LINE}" stroke-width="1.5"/>` + (gk === "pearl" ? pearl(x, 134, 4) : `<circle cx="${x}" cy="134" r="3.6" fill="url(#m)"/>`); }
      return { src: toUrl(svg(90, 142, body, D)), aspect: 90 / 142, fit: { anchor: "top", k: 1.35 } };
    }
    if (has("chandelier", "drop", "cascade")) {
      let body = stone(40, 12, 9, !!gem);
      const tiers = [[40], [28, 52], [18, 40, 62], [10, 30, 50, 70]];
      tiers.forEach((row, i) => row.forEach((x) => { body += `<line x1="40" y1="${22 + i * 30}" x2="${x}" y2="${42 + i * 30}" stroke="${LINE}" stroke-width="1.2"/>` + stone(x, 44 + i * 30, 6 + (i === 3 ? 1.5 : 0), !!gem); }));
      body += stone(40, 172, 11, !!gem);
      return { src: toUrl(svg(80, 188, body, D)), aspect: 80 / 188, fit: { anchor: "top", k: 1.25 } };
    }
    // stud
    const body = gk === "pearl" ? pearl(30, 30, 20) : stone(30, 30, 20, !!gem);
    return { src: toUrl(svg(60, 60, body, D)), aspect: 1, fit: { anchor: "center", k: 0.55 } };
  }

  /* Ring: the band as seen across the back of the finger, setting on top. */
  if (type === "ring") {
    const W = 200, H = 150;
    const band = `M20,78 Q100,128 180,78`;
    const plain = !gem && !enamel;
    let body = `<path d="${band}" fill="none" stroke="url(#mv)" stroke-width="${plain ? 24 : 16}" stroke-linecap="round"/>`;
    body += `<path d="${band}" fill="none" stroke="${metal[2]}" stroke-opacity=".75" stroke-width="2.5" transform="translate(0 -${plain ? 8 : 5})"/>`;
    if (has("trilogy", "three")) {
      body += emeraldCut(64, 74, 22, 28) + emeraldCut(136, 74, 22, 28) + emeraldCut(100, 72, 32, 40);
    } else if (has("halo")) {
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; body += stone(100 + Math.cos(a) * 31, 66 + Math.sin(a) * 31, 4.5, true); }
      body += stone(100, 66, 24, true);
    } else if (has("cocktail", "statement") || (gem && gk !== "diamond")) {
      body += `<ellipse cx="100" cy="66" rx="34" ry="28" fill="url(#m)"/><ellipse cx="100" cy="66" rx="29" ry="23" fill="${gem ? "url(#g)" : "url(#m)"}"/>` + sparkle(88, 56, 12);
      for (const [x, y] of [[70, 48], [130, 48], [70, 84], [130, 84]]) body += `<circle cx="${x}" cy="${y}" r="4" fill="url(#m)"/>`;
    } else if (gem) {
      body += stone(100, 64, 22, true);
    }
    return { src: toUrl(svg(W, H, body, D)), aspect: W / H, fit: { anchor: "center", k: 1.3 } };
  }

  /* Bracelet / bangle / cuff: the front of the band across the wrist. */
  const W = 300, H = 130;
  const arc = `M14,44 Q150,124 286,44`;
  let body = "";
  if (gem && has("tennis", "line", "riviere")) {
    body += `<path d="${arc}" fill="none" stroke="url(#m)" stroke-width="6"/>`;
    for (let i = 0; i <= 18; i++) { const t = i / 18; const p = bez(t, { x: 14, y: 44 }, { x: 105, y: 97 }, { x: 195, y: 97 }, { x: 286, y: 44 }); body += stone(p.x, p.y, 9, true); }
  } else {
    const cuff = has("cuff");
    body += `<path d="${arc}" fill="none" stroke="url(#mv)" stroke-width="${cuff ? 30 : 16}" stroke-linecap="${cuff ? "butt" : "round"}"/>`;
    body += `<path d="${arc}" fill="none" stroke="${metal[2]}" stroke-opacity=".75" stroke-width="2.5" transform="translate(0 -${cuff ? 11 : 5})"/>`;
    if (has("filigree", "bangle", "heritage")) body += `<path d="${arc}" fill="none" stroke="${metal[4]}" stroke-opacity=".55" stroke-width="${cuff ? 22 : 9}" stroke-dasharray="2 5"/>`;
    if (gem) body += stone(150, 86, 12, true);
  }
  return { src: toUrl(svg(W, H, body, D)), aspect: W / H, fit: { anchor: "center", k: 1.2 } };
}
