# DevX Boutique OS

**AI-powered Jewellery Commerce & Retail Intelligence Platform** — a production-grade
digital operating system for jewellery retailers. It pairs a **premium customer Digital
Boutique** with a **branch-aware Jeweller CRM**, both sharing one PostgreSQL source of truth.

Built for the DevX jewellery PRD + UAE competitive gap analysis. The product does **not**
position as "another jewellery ERP" — the wedge is the customer-first, AI-ready journey:
*new piece → publish → discover → share → inquire → appointment → quote → invoice → intelligence.*

> Demo tenant: **Aurelia Fine Jewellery** (Dubai / Abu Dhabi). Seeded with a real catalogue,
> branches, staff & customer logins, 6 months of gold-rate history, offers and suppliers.

---

## Two apps, two URLs, two design systems

| App | Folder | Dev URL | Design system |
|-----|--------|---------|---------------|
| **Customer Digital Boutique** | `apps/boutique` | http://localhost:5173 | **Dark-luxury** mobile app — warm near-black canvas, glowing metallic gold, dramatic imagery, serif display + sans UI on a Bento grid. Uses the supplied **circular gallery** and **metallic button**. |
| **Jeweller CRM** | `apps/crm` | http://localhost:5174 | **Dark command-centre** — deep graphite surfaces, luminous gold accent, dense tables and status chips, gold-glow primary actions. |
| **API + database** | `server` | http://localhost:4000 | Node + Express + Prisma + PostgreSQL |
| **Shared UI** | `packages/ui` | — | `ScrollableCardStack`, `MetallicButton`, `cn` |

See **[DESIGN_SYSTEMS.md](./DESIGN_SYSTEMS.md)** for the full design rationale and why this UI
direction was chosen over glassmorphism / neumorphism / the other options.

---

## Tech stack

- **Frontend:** React 18 + **TypeScript** + Vite + **Tailwind CSS v4** (required by the
  supplied components) + Recharts + Motion + lucide-react
- **Backend:** Node + Express + **TypeScript**, JWT auth (bcrypt), RBAC + tenant/branch scoping,
  Zod validation, audit logging, server-side gold-rate ingestion worker
- **Database:** **PostgreSQL** via Prisma (real migrations, FKs, indexes, soft-archive, audit log)
- **Deploy:** Render blueprint (`render.yaml`) — managed Postgres + API + 2 static sites

---

## Quick start (local) — one command

Requirements: **Node ≥ 20** and **PostgreSQL** (either Docker Desktop, or a local
PostgreSQL 16 — `brew install postgresql@16 && brew services start postgresql@16` on macOS).
You do **not** need Docker; the setup script uses your local PostgreSQL automatically if
Docker isn't running.

From the project folder run:

```bash
bash bootstrap.sh
```

That installs dependencies, creates `server/.env`, starts (or connects to) PostgreSQL,
applies the schema and seeds the demo data. When it finishes, start everything:

```bash
npm run dev
```

Then open:
- Boutique → http://localhost:5173
- CRM → http://localhost:5174

<details>
<summary>Manual steps (if you prefer to run them yourself)</summary>

```bash
npm install
cp .env.example server/.env
npm run db:up
npm run prisma:generate
npm run prisma:deploy
npm run db:seed
npm run dev
```

If you use a local PostgreSQL instead of Docker, edit `server/.env` and change the
`DATABASE_URL` port from `5433` to `5432` (and the user/password/db to match your machine).
</details>

---

## Login credentials (seeded, real bcrypt-hashed accounts)

### CRM — http://localhost:5174  ·  password `Password123!`

| Role | Email |
|------|-------|
| Owner (full access) | `owner@aurelia.ae` |
| Company Admin | `admin@aurelia.ae` |
| Branch Manager (Dubai Mall) | `manager@aurelia.ae` |
| Sales (Gold Souk) | `sales@aurelia.ae` |
| Inventory (Abu Dhabi) | `inventory@aurelia.ae` |
| Analyst | `analyst@aurelia.ae` |

### Boutique — http://localhost:5173

| Field | Value |
|-------|-------|
| Phone | `+971501112233` |
| Password | `Customer123!` |

(You can also register a fresh customer from the boutique **Account** page.)

---

## What's implemented (MVP scope from the PRD build sequence)

**Shared:** one product record powers both apps · tenant + branch isolation · RBAC ·
JWT auth (separate staff and customer identities) · audit log · UAE VAT on quotes/invoices.

**Customer Boutique:** editorial home (hero, card-stack collections, bento grid) · catalogue
with filters & sort · product detail (gallery, specs, branch availability, certificate, save,
share) · **cart → inquiry** (creates a CRM lead) · appointment booking (syncs to CRM calendar) ·
**live gold-rate experience** with 1M/3M/6M/1Y history chart · offers · customer accounts.

**Jeweller CRM:** executive dashboard (revenue, conversion, branch comparison, low-stock,
gold) · catalog & inventory with product creation (appears on the boutique instantly) ·
**leads pipeline** (New→Qualified→Quoted→Appointment→Converted→Lost) with assignment ·
appointments · customers (segments + consent) · **quotations** (jewellery pricing: metal /
making / stones / VAT, customer-shareable link) · **one-click quote → invoice** · invoices
(payment status) · suppliers (payables) · campaigns/offers · **gold-rate admin with audited
manual override** · branches · team & roles · audit trail.

**Gold engine:** server-side only. Persisted daily observations (never overwritten), 4 karats,
manual override with `MANUAL` source flag + audit. If the external feed is down the app keeps
showing the last persisted value — it never breaks. Configure a provider in `.env`
(`GOLD_PROVIDER=goldapi|metalsdev`) to enable live ingestion.

**AI features (built, in the mobile app):**
- **AI Catalog Studio** — photo in → background handled, jewellery type detected, category /
  tags / metal / karat suggested, description + SEO + WhatsApp card written, SKU + URL minted,
  publish straight to the shared catalogue.
- **AI Visual Search** — upload a photo → matched against the real inventory → View / Add to
  bag / Ask price / Book appointment on each result.
- **Jewelry Intelligence** — owner insights over the last 6 months of sales, stock and
  conversion.

They call the API's `/api/ai/*` routes, which use OpenAI vision when `OPENAI_API_KEY` is set in
`server/.env` and fall back to built-in curated logic (no key required) otherwise.

**Phase 2/3 (architecture-ready, not built in v1):** try-on, demand forecasting & purchase
advisor, WhatsApp tracked links, POS, RFID, repair/exchange, manufacturing, loyalty.

---

## Deploy to Render (both apps get their own URL)

This repo includes a **`render.yaml` blueprint**. From the Render dashboard:

1. **New → Blueprint**, connect this repo. Render reads `render.yaml` and provisions:
   - `devx-boutique-db` — managed PostgreSQL
   - `devx-boutique-api` — the API (runs `prisma migrate deploy` + seed on build)
   - `devx-boutique-web` — the **Customer Boutique** (static site, its own URL)
   - `devx-boutique-crm` — the **Jeweller CRM** (static site, its own URL)
2. After the first deploy, set these env vars (marked `sync: false`):
   - On **api**: `CORS_ORIGINS` = the boutique + CRM URLs (comma-separated)
   - On **web** and **crm**: `VITE_API_URL` = the API URL (e.g. `https://devx-boutique-api.onrender.com`)
   - Trigger a redeploy of the two static sites so the API URL is baked into the build.
3. `JWT_SECRET` is auto-generated. To skip demo seeding in production, remove `&& npm run db:seed`
   from the api `buildCommand`.

The stack maps 1:1 to the PRD's production recommendation (React/TS front, Node/TS API,
managed PostgreSQL, background worker, Render services, migrations, audit, RBAC).

---

## Project layout

```
devx-boutique-os/
├─ server/                 Express + Prisma API (source of truth)
│  ├─ prisma/schema.prisma  20 models · enums · indexes
│  ├─ prisma/seed.ts        real tenant/branches/logins/catalogue/gold history
│  └─ src/routes/           auth · public(boutique) · products · sales · admin
├─ apps/boutique/          Customer Digital Boutique (Vite/React/TS)
├─ apps/crm/               Jeweller CRM (Vite/React/TS + shadcn-style)
├─ packages/ui/            Shared components (card stack, metallic button)
├─ render.yaml             One-click Render blueprint
└─ docker-compose.yml      Local PostgreSQL
```

---

## Notes

- **No-dummy-data principle:** the seed is a clearly-labelled development dataset (source
  `SEED` on gold observations). Production should import real catalogue/customers/opening
  inventory via CSV and start clean — remove the seed step from the deploy command.
- **Security baseline:** server-side authorization on every protected route, tenant + branch
  scoping, role checks, bcrypt hashing, JWT expiry, audit log on sensitive actions,
  configurable CORS.
- Built with **DevX Boutique OS** · *Aurelia Fine Jewellery* demo tenant.
