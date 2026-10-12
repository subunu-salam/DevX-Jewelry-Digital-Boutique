/**
 * Lightweight, on-device reading of a jewellery photo — no API key needed.
 * Works out the metal tone, accent colours (enamel / stones) and rough shape
 * (pendant on a chain, ring, earrings, bangle) so the server can rank real
 * inventory against it instead of returning generic picks.
 */
export interface ImageHints {
  metal: "Yellow" | "White" | "Rose" | null;
  accents: string[]; // blue, green, red, pink, black, white-sparkle, pearl
  shape: "pendant" | "necklace" | "ring" | "earrings" | "bangle" | null;
}

export async function readImageHints(dataUrl: string): Promise<ImageHints> {
  const img = await new Promise<HTMLImageElement>((ok, bad) => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = dataUrl;
  });
  const S = 96;
  const c = document.createElement("canvas"); c.width = S; c.height = S;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S).data;

  // Background = average of the border pixels.
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (let i = 0; i < S; i++) for (const [px, py] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) {
    const k = (py * S + px) * 4; br += d[k]; bg += d[k + 1]; bb += d[k + 2]; bn++;
  }
  br /= bn; bg /= bn; bb /= bn;

  const fg: boolean[] = new Array(S * S).fill(false);
  const tone = { Yellow: 0, White: 0, Rose: 0 };
  const acc: Record<string, number> = {};
  let n = 0;
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    const k = (y * S + xx) * 4, r = d[k], g = d[k + 1], b = d[k + 2];
    if (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) < 60) continue;
    fg[y * S + xx] = true; n++;
    const [h, s, l] = hsl(r, g, b);
    if (s > 0.25 && h >= 30 && h <= 55 && l > 0.3 && l < 0.85) tone.Yellow++;
    else if (s > 0.2 && (h < 30 || h > 345) && l > 0.45 && l < 0.85) tone.Rose++;
    else if (s < 0.12 && l > 0.55) tone.White++;
    let a: string | null = null;
    if (l < 0.12) a = "black";
    else if (s > 0.3 && h >= 190 && h <= 255) a = "blue";
    else if (s > 0.3 && h >= 90 && h < 170) a = "green";
    else if (s > 0.35 && (h >= 345 || h < 12) && l < 0.6) a = "red";
    else if (s > 0.3 && h >= 300 && h < 345) a = "pink";
    else if (l > 0.93) a = "white-sparkle";
    if (a) acc[a] = (acc[a] ?? 0) + 1;
  }
  if (n < 30) return { metal: null, accents: [], shape: null };

  const metal = (Object.entries(tone).sort((p, q) => q[1] - p[1])[0][1] > n * 0.08
    ? (Object.entries(tone).sort((p, q) => q[1] - p[1])[0][0] as ImageHints["metal"]) : null);
  const accents = Object.entries(acc).filter(([, v]) => v > n * 0.004 && v > 3).sort((p, q) => q[1] - p[1]).map(([k]) => k);

  // Shape: bounding box, fill, and how the top of the piece looks.
  let x0 = S, x1 = 0, y0 = S, y1 = 0;
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) if (fg[y * S + xx]) {
    x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, fill = n / (w * h);
  const rowFill = (y: number) => { let k = 0; for (let xx = x0; xx <= x1; xx++) if (fg[y * S + xx]) k++; return k / w; };
  const topBand = avg(range(y0, y0 + Math.floor(h * 0.4)).map(rowFill));
  const lowBand = avg(range(y0 + Math.floor(h * 0.6), y1 + 1).map(rowFill));
  const touchesTop = y0 <= 2;
  const colGap = (() => { // two separate blobs side by side → earrings
    const mid = range(x0 + Math.floor(w * 0.35), x0 + Math.floor(w * 0.65));
    return mid.some((xx) => range(y0, y1 + 1).every((y) => !fg[y * S + xx]));
  })();

  let shape: ImageHints["shape"] = null;
  if (colGap && h > w * 0.6) shape = "earrings";
  else if (touchesTop && topBand < 0.12 && lowBand > topBand * 1.6) shape = "pendant"; // thin chain above a heavier drop
  else if (touchesTop && fill < 0.2) shape = "necklace";
  else if (w / h > 0.75 && w / h < 1.35 && fill < 0.45) shape = accents.length || h < S * 0.75 ? "ring" : "bangle";
  return { metal, accents, shape };
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
const avg = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const dd = mx - mn, s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
  const h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  return [h * 60, s, l];
}
