# Aurelia Boutique — Design System

Direction (PRD §4): **Luxury Editorial Commerce + Quiet Technology.**
Serif = luxury (Cormorant Garamond). Sans = usability (Manrope).

## Tokens (`src/index.css`)
| Role | Token | Hex |
|---|---|---|
| Primary background — warm ivory | `background` | #F7F2E8 |
| Secondary — champagne | `champagne` / `sand` | #EDE3D1 / #F1EADC |
| Dark — deep charcoal | `ink` | #1F1C18 |
| Accent — restrained metallic gold | `brand` / `brand-deep` / `brand-soft` | #A8874E / #86683A / #D9C7A2 |
| Cards — soft ivory/white | `surface` | #FFFDF8 |
| Borders — subtle warm gray | `border` | #E4DBCB |
| Text — charcoal / muted | `foreground` / `muted-foreground` | #26221D / #6F675B |

Gold is an accent only (hairlines, the active nav line, icons, prices on offers). Primary CTAs are charcoal.

## Components (`src/design`, import from `@/design`)
LuxuryButton · IconButton · ProductCard · ProductGrid · SectionHeading · Navbar · Footer · Brand/PoweredBy ·
SearchBar · FilterGroup/FilterOption/FilterChip/ActiveFilter · Badge · Price · GoldRateCard · BranchCard ·
OfferCard · AppointmentCard · Modal · Drawer · Input · Select · Tabs · Toast (`useToast`) · Breadcrumb

## Motion (`src/design/motion.ts`)
One easing curve (`EASE`) everywhere. Signature moment: Home hero — masked serif line reveal, arched image
clip-reveal, gold arch stroke drawn once. Everything else responds to the user: route cross-fade, shared-layout
nav/tab/chip indicators, staggered grid entrance, drawer/sheet with drag-to-close, PDP lens zoom, swipe gallery,
toast confirmations. `MotionConfig reducedMotion="user"` + CSS media query honour reduced-motion settings.

## Responsive
Desktop/laptop: top navigation. Phones (Android/iOS): top brand bar + bottom tab bar, safe-area insets,
bottom-sheet modals & filters, sticky PDP action bar. Primary nav: Home · Shop · Studio · Gold · Bag.
