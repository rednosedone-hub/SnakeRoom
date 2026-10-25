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
  **auto-disappears from the public page 7 days later**. The sale stays on the snake record
  and in the private Finances ledger forever for accounting.
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

### Phase 0 — private ledger (built, nothing public)
- **Acquisition & sale on the snake record**: purchase price, who it came from, how it was
  acquired, sale price, buyer, sale date and the show it sold at — all private, all on the
  snake itself. Produced snakes record sire, dam and clutch instead of a purchase price.
- **Finances page** (`finance.html`, Pro/Owner): overview of money in, money out and net;
  snakes bought and sold; feeder prices and feeder orders; a show planner that totals booth,
  travel and other costs against sales linked to that show; and other costs (supplies, vet,
  shipping).
- **Backup**: expenses, shows and feeder settings ride along in the normal snapshot
  (`financeExpenses`, `financeExpos`, `financeSettings`).
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
- **Finance growth** — the private ledger covers the basics today; these are the next
  useful layers, none built yet:
  - profit per clutch and per pairing, so the roadmap can say which pairs actually pay for
    themselves;
  - feed cost per snake and per season, not just the whole collection;
  - show year-over-year comparison — same show, different years, side by side;
  - CSV export of purchases, sales, expenses and shows for an accountant or a spreadsheet;
  - server-side enforcement of the `finance` flag once snapshot writes move behind an Edge
    Function (see §8), so a Pro feature is actually protected rather than hidden in the UI.
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
4. **Price lives on the snake** — Available carries it publicly; Sold records price, date,
   buyer and show on the snake, and the private Finances page totals them.
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

---

## 8. Turning the app into a product (accounts, plans, billing)

*(2026-10-17)*

### What already exists

Accounts are real today, not planned:

- **Sign-in**: Supabase email/password (plus magic link, reset, resend confirmation) in
  `cloud-sync.js`. Sessions persist in `localStorage` and refresh themselves, so a signed-in
  phone stays signed in.
- **Per-account isolation**: `snake_room_backups` is one row keyed `user_id` with RLS
  (`auth.uid() = user_id`); photos sit in the `snake-photos` bucket under `auth.uid()/...`.
  Two accounts cannot read each other's rows or folders.
- **Automatic sync**: `auto-sync.js` marks snapshot keys dirty on every write, pushes ~8s
  after the last change, flushes on navigation, pulls when the cloud copy is newer, and
  holds changes locally when offline.
- **Account UI**: `account.html` (sign-in/create/reset/sign-out, plan display, sync status) and
  `account-gate.js`, which asks a signed-out visitor to sign in but still allows
  *Keep this device only* so an offline snake room never locks the keeper out.
  `cloud-sync.html` is a redirect kept only for old bookmarks and reset emails.

### Tiers (the numbers live in `plans.js`)

| Plan | Animals | Photos per animal | Breeding + outcomes | Goal planner | Money tools | Storefront listings |
|---|---|---|---|---|---|---|
| **Free** | 20 | 1 | — | — | — | — |
| **Breeder** | 100 | 3 | ✓ | ✓ | — | — |
| **Pro** | unlimited | 10 | ✓ | ✓ | ✓ | ✓ |
| **Owner** (not sold) | unlimited | unlimited | ✓ | ✓ | ✓ | ✓ |

`plans.js` is the single source of truth: `SnakePlans.getPlan()`, `.allows("breeding")`,
`.allows("finance")` and `.describePlan()` are what pages call. Changing a limit is a
one-line edit. Until a `profiles` table exists, `DEFAULT_PLAN` is `owner`, so the app is
unrestricted. The money tools are locked by the `finance` flag today; the check is
client-side, like the other plan limits.

### Enforcement, in three steps

1. **Now (client-side, honest limit)**: hide or lock the breeding pages, refuse a 21st animal
   and extra photos, show an upgrade prompt. Bypassable — the browser is the source of truth
   and the publishable Supabase key is public. Acceptable for launch goodwill, not for revenue.
2. **When money starts**: add a `profiles` table and route snapshot writes through a Supabase
   Edge Function that checks the plan before saving; a billing webhook sets `profiles.plan`.
   Limits then live where the data lives and no secret leaves the server.
3. **If it grows**: per-record tables (`snakes`, `pairs`, `clutches`, `photos`) with RLS and
   triggers that count rows against the plan. This also fixes today's last-write-wins snapshot
   sync, where two devices editing at once can lose changes.

Proposed `profiles` SQL (not applied yet — run it when step 2 begins):

```sql
create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'breeder', 'pro', 'owner')),
  billing_provider text,
  billing_customer_id text,
  plan_renews_at timestamptz,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Read own profile" on profiles
  for select using (auth.uid() = user_id);
-- Writes come from the billing webhook (service role), never the browser.
```

### Billing: decision still open (Canadian seller)

Researched 2026-10-17. The seller is in Canada and sells to CA/US/UK/EU, so **who handles
sales tax** matters more than the headline percentage.

| Option | Cost | Tax handling |
|---|---|---|
| **PayPro Global** (Toronto MoR) | quote only | Merchant of record: calculates, collects, remits global indirect tax |
| **Paddle** (UK MoR) | 5% + US$0.50 per checkout | Merchant of record |
| **Stripe Managed Payments** | Stripe fees **+3.5%** | Merchant of record |
| **Stripe Canada** | 2.9% + C$0.30 domestic; +0.8% international cards; Billing +0.7%; Tax 0.5% or C$0.50/txn | You remain the seller: register, file, remit |
| **Helcim** (Calgary) | interchange + 0.50% + C$0.25 (online/recurring, to C$50k/mo) | You remain the seller |
| **Moneris** (Toronto) | 2.85% + C$0.30 online, 0.80% foreign-card fee | You remain the seller |

Canadian providers (Helcim, Moneris, Nuvei) all have recurring/subscription APIs; none is a
merchant of record. **PayPro Global is the only Canadian-based MoR found** and is quote-only;
Paddle has published pricing. If staying the seller, Stripe Canada is the simplest developer
path and Helcim the strongest published-price Canadian alternative.

Tax facts to plan around (not advice): Canada's GST/HST small-supplier threshold is **C$30,000**
over four consecutive quarters; a non-established seller makes taxable UK supplies subject to
registration **regardless of value**; EU B2C digital services are taxed where the customer lives
and a non-EU seller can use **non-Union OSS**.

### Platform costs before launch

- **Supabase Pro, US$25/month** is the first real cost: free projects pause after a week of
  inactivity (a paid app would go down), and free gives 1 GB storage / 5 GB egress versus
  100 GB / 250 GB. Photos dominate egress, so keep compressing to ~1400px.
- Billing has no monthly fee at Stripe/Paddle/PayPro; the fee is per transaction.

### Before a public launch (not yet done)

- **Photo privacy**: the bucket is public-read. Paid accounts should use per-user signed URLs.
- **Rate limiting / abuse**: Supabase's own limits protect the project, but a free tier with
  unlimited sign-ups invites storage abuse; add a photo byte cap per plan.
- **Delete account** action (data portability and deletion expectations).
- **Pricing page** and a paid-tier checkout; `plans.js` already holds the matrix to render.

### Open decisions

1. Billing provider: PayPro Global (Canadian MoR, quote) vs Paddle (published 5% + $0.50) vs
   Stripe Canada (cheapest, most admin).
2. Whether the free tier keeps the goal planner (currently not included).
3. When to make sign-in mandatory and remove *Keep this device only*.
4. Whether public storefront listings are a Pro feature or sold separately.
