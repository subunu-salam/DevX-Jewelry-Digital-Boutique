# Virtual Try-On (PRD · AI Studio · Phase 2)

> "Customer uploads/selects an image and previews selected jewelry. Clearly label as
> visualization, not exact fit/appearance guarantee."

## Customer experience
- Entry points: **Try it on, virtually** on every supported product page, and **AI Studio → Virtual Try-On** (`/try-on`).
- Photo sources: **live camera**, **take a photo**, or **upload**. The photo stays in memory for the visit so customers can try several pieces.
- Automatic placement (on-device, MediaPipe face/hand landmarks):
  necklace & pendant at the neckline, earrings at both ears, ring on the ring finger, bracelet/bangle at the wrist.
- Fine-tune by drag, pinch, size/angle sliders, flip, reset, hold-to-compare.
- Save / share the result (watermarked "Visualization only"), add to inquiry, or book a viewing.
- Optional **Create realistic AI render** (photorealistic blend via the AI provider).

## Labelling & privacy
- "Visualization only" chip on every preview, disclaimer under every view, and a watermark on saved/shared images.
- Overlay try-on runs fully in the browser — the photo is **never uploaded**.
- AI render requires explicit consent; the photo is processed in memory and **never stored** (no DB rows, files or logs).
- AI render is rate-limited per IP (6 per 15 min) to protect AI spend.

## CRM — per-product settings (Catalog → Try-on column)
- Enable/disable try-on, choose how it's worn (automatic from category or manual).
- Optional **cut-out**: an https link to a transparent PNG of the piece (best realism). Earrings: the pair side by side.
- Without a cut-out, the app auto-cuts product photos shot on a plain background. Lifestyle photos use the AI render (if enabled) or invite a boutique visit.
- Stored as a `ProductMedia` row with `kind = "tryon:<type>"` (no migration needed); hidden from galleries.

## Configuration (API service)
| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enables the AI render (already used by Visual Search). |
| `TRYON_AI` | `off` disables only the AI render module. |
| `TRYON_MODEL` | Image model for renders (default `gpt-image-1`). |

## Endpoints
- `GET /api/ai/try-on/config` → `{ aiRender, disclaimer }`
- `POST /api/ai/try-on/render` `{ productId, photo (data URL), consent: true }` → `{ image }`
- Public product payloads include `tryOn: { type, assetUrl } | null`.
- `PUT /api/crm/products/:id` accepts `tryOn: { enabled, type, assetUrl }`.

## Notes
- Live camera needs HTTPS (works on Render and on `localhost`).
- The landmark models load from Google's CDN the first time the studio opens (~5 MB, then cached by the browser).
