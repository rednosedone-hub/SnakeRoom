# Soulless Serpents — Roadmap

> **Crafted in Darkness, Bred for Excellence.**

The long-term plan for taking The Snake Room from private breeding tool to public
storefront. This file records the vision, the design decisions already made, and the
build order — so any future session (human or AI) can pick up exactly where we left off.

---

## 1. The two-site model

| Site | Role | Where |
|---|---|---|
| **The Snake Room** (this app) | Private cockpit: collection, feeding, breeding, clutches, outcomes, sales ledger. Never public. | GitHub Pages: `rednosedone-hub/SnakeRoom` |
| **Soulless Serpents** | Public storefront: available animals, morph calculator, projects. For everyone. | Future separate repo + custom domain |

**One brain, two faces.** A small public Supabase table is the bridge: it doesn't care
which site reads it, so the same data can feed a page here, the Soulless Serpents site,
or both at once. Photos are already in the public-read `snake-photos` bucket and can be
hotlinked by any domain — zero duplication, no new photo plumbing.

## 2. Status lifecycle (the core data flow)

Everything downstream derives from snake statuses, which already exist in the app:

- **Available** → automatically published to the public listings. Photo, morph, price shown.
- **Deposit taken** → status **On Hold**. Still public, with an **On Hold** badge.
- **Sold** → sale recorded (price + date), public badge flips to **Sold**, and the listing
  **auto-disappears from the public page 7 days later**. The sale stays in the private
  sales history forever for accounting.
- **Any other status** (Breeder, Holdback, Juvenile, ...) or snake deletion → listing is
  removed from the public side automatically.

**Foundation truth:** statuses + clean snake records are the entire base. If they stay
tidy, every future phase is only presentation.

## 3. Public listings design (the bridge)

- Supabase table **`public_listings`**: composite PK `(user_id, snake_id)`, a unique
  public `slug` for future shareable URLs, jsonb `genes` + `photo_urls`, `price`,
  `status`, hold/sold timestamps.
- **RLS: public SELECT allowed; writes only for the owning authenticated user.**
- Public pages read it with the publishable key (already public in the client) — no
  login, no access to snakes, pairs, clutches, or any private snapshot data.
- **Publish engine** in `cloud-sync.js`: diffs current Available / On Hold / Sold(recent)
  snakes against the table; upserts changes, deletes removed ones; runs automatically
  after every successful snapshot push, plus a manual "Update public listings" button.
- Setup SQL embedded in `cloud-sync.js` with a copy button and a live existence check —
  same friendly pattern as `PHOTO_SETUP_SQL`.

## 4. The funnel (why the calculator matters)

The morph calculator is a **traffic magnet**, not a gimmick — people constantly search
"ball python morph calculator." The plan:

1. Visitor calculates a pairing → sees possible offspring genes.
2. Page shows **"Snakes currently available with these genes"** pulled from the public
   listings (available status only).
3. Visitor goes from *what would this pairing produce* to *buy one like it* — on our site.

The gene catalog grows continuously (more genes get added as the collection grows), which
makes the calculator more useful and the funnel wider over time.

## 5. Phased build order

### Phase 0 — private ledger (small, useful now, nothing public)
- **Price field** on the snake form (private, like bin number).
- **Sale recording**: marking a snake **Sold** captures price + sale date into a `sales`
  list that rides along in the normal snapshot backup (`SNAPSHOT_KEYS`).
- **Sales history view** on the Available page (private): sold snakes with price/date,
  count and gross totals — accounting from day one.
- **ROADMAP.md** (this file).

### Phase 1 — public storefront (when animals are ready to list)
- `public_listings` SQL + publish engine (design in §3).
- **Public Available page**: cards with main photo, name, morph, gene chips, hatch date,
  price, Available/On Hold/Sold badges. Sold drops off automatically after a week.
- **Public morph calculator**: gene picker only — no collection roster — plus the §4
  gene funnel.
- Deployable either as pages here or directly as the Soulless Serpents repo.

### Phase 2+ — growth ideas (rough notes, no commitments)
- **Projects page** — "we work with" public gene list (a safe public face of the collection).
- **Pairings / upcoming season teaser** — public read-only slice of planned pairs.
- **Newly hatched feed** — Outcomes data as social proof ("hatched 4 this month").
- FAQ / care basics + contact/inquiry flow (fewer questions, more serious buyers).
- Per-morph SEO landing pages.
- **Accounting ledger growth** — feeder costs, shipping, profit per clutch, which pairs
  actually make money.
- Custom domain for Soulless Serpents; dedicated sales ledger table in Supabase if the
  local snapshot copy ever outgrows it.

## 6. Decisions made so far

*(2026-10-04)*

1. **Public data lives in a Supabase table** (`public_listings`) — chosen over public
   JSON blobs and repo-committed files because browser-only edits can't commit and the
   table is site-agnostic.
2. **Public morph calculator has no roster** — gene picker only; the private calculator
   keeps collection integration.
3. **Public cards show photo + details** — buyers want to see the animal before buying.
4. **Price lives on the snake** — Available carries it publicly; Sold records it in the
   private sales history with the date.
5. **The public site is Soulless Serpents** — eventually its own repo/domain; the
   bridge design works from either site.
6. **No rush** — just started breeding; only Phase 0 is a near-term build. Options stay
   open as we go.
7. **Tagline**: *Crafted in Darkness, Bred for Excellence.*

## 7. Brand notes

- **Name**: Soulless Serpents
- **Tagline**: Crafted in Darkness, Bred for Excellence
- **Aesthetic**: the black-and-gold gothic look and The Snake Room shield already fit the
  name; the public site can inherit the palette now and grow its own mark later.
- Flavor lines in the same voice: *"No soul. All scale."*
