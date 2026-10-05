# Design Systems

DevX Boutique OS runs **two deliberately separate design systems**. Trying to make a CRM
look like a luxury website (or vice-versa) weakens both; keeping them distinct makes the
product feel more premium and commercially credible.

---

## The UI-style decision

The brief listed many possible aesthetics (glassmorphism, neumorphism, claymorphism, bento,
brutalism, minimalism, neobrutalism, aurora, cyberpunk, liquid, skeuomorphism, material,
flat, Y2K, spatial). For a **premium UAE luxury jewellery** brand, most read as "tech toy"
and actively cheapen the product. The chosen direction:

### Customer Boutique → **Editorial Minimalism, composed on a Bento grid**

- **Minimalism** carries the luxury: warm ivory / champagne / deep charcoal, restrained
  metallic gold, generous whitespace, large photography, elegant serif display + modern sans UI.
  This is the "quiet technology / editorial luxury" the PRD asks for.
- **Bento UI** gives the modular, magazine-like composition (gold-rate tile, appointment tile,
  offer tile, branches tile) without looking like a generic Shopify grid.
- **Explicitly rejected:** glassmorphism (the brief said avoid it), neumorphism/claymorphism
  (toy-like), brutalism/neobrutalism (loud, wrong for luxury), cyberpunk/Y2K/aurora/liquid
  (flashy), skeuomorphism (dated). Luxury = restraint, not effects.

The supplied **scrollable card stack** becomes the featured-collections showcase, and the
**metallic button** becomes the primary CTA — both are a natural fit for this direction.

### Jeweller CRM → **shadcn-style enterprise command-centre**

- Clean, dense, information-first. Neutral surfaces, hairline borders, status chips, a
  charcoal navigation rail for the "command-centre" feel, and the same gold accent to tie the
  two systems together.
- This is the right tool for operators looking at tables all day — not a luxury storefront.

---

## System 1 — Customer Boutique (`apps/boutique`)

Tokens live in `apps/boutique/src/index.css` (`@theme`). Tailwind CSS **v4**.

| Token | Value | Use |
|-------|-------|-----|
| `--color-background` | `#fbf9f4` ivory | page base |
| `--color-foreground` | `#1a1712` charcoal ink | text |
| `--color-champagne` | `#efe7d8` | soft cards / image placeholders |
| `--color-sand` | `#f3eee3` | editorial bands, footer |
| `--color-brand` | `#b08d57` restrained gold | accents, CTAs |
| `--color-brand-deep` | `#8c6d3f` | eyebrow labels |
| `--color-border` | `#e7e1d6` | hairlines |

- **Type:** Cormorant Garamond (serif display, headings) + Inter (sans, UI/data).
- **Motion:** Motion (Framer) — subtle reveal on scroll, image zoom on hover, spring
  transitions. Never distracts from product imagery; respects `prefers-reduced-motion`.
- **Cards:** large image-led, minimal metadata, clear price/CTA hierarchy.
- **Signature components:** `ScrollableCardStack` (hero collections), `MetallicButton`
  (primary CTAs — labels kept short to fit the fixed pill).

## System 2 — Jeweller CRM (`apps/crm`)

Tokens in `apps/crm/src/index.css` (`@theme`). Tailwind CSS **v4**.

| Token | Value | Use |
|-------|-------|-----|
| `--color-background` | `#f7f8fa` | app canvas |
| `--color-card` | `#ffffff` | cards, tables |
| `--color-sidebar` | `#14161c` charcoal | navigation rail |
| `--color-primary` | `#b08d57` gold | accent (ties to boutique) |
| `--color-border` | `#e6e9ef` | table hairlines |
| success/warning/danger/info | green/amber/red/blue (+ `-bg`) | status chips |

- **Type:** Inter only, 14px base — dense but legible.
- **Primitives** (`src/components/ui.tsx`): `Card`, `Button`, `Input`, `Select`, `Badge`
  (status-aware), `Modal`, `PageHeader`, `Field`, `EmptyState`.
- **Data-viz:** Recharts, gold accent, hairline grids, rounded bars — one consistent chart
  language across dashboard and gold-rate.

---

## Why Tailwind v4

The supplied `metallic-button` and `scrollable-card-stack` components use v4-native utilities
(`transform-3d`, `translate-z-*`, `perspective-*`, fractional spacing like `h-11.5`). The
project therefore uses Tailwind CSS v4 with the `@tailwindcss/vite` plugin and CSS-first
`@theme` tokens. The shared package is scanned via `@source` so its classes are generated.
