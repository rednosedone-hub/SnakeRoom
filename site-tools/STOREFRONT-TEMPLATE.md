# Running your own Soulless Serpents storefront

The `soulless-serpents/` folder is a complete ball python storefront: home page with live counts, filterable available list, morph calculator, care and genetics guide, and a contact block. It is plain HTML, CSS and JavaScript — no build step, no server, no database. Cloudflare serves it free.

To run it as your shop, you change **one file** for your identity, **one file** for your animals, and add your photos.

## 1. Your shop's identity — `js/site-config.js`

Everything on this list is written into all four pages at load: header, hero, footers, contact block and the home page stats.

```js
shopName: "Your Shop Name",        // last word is gold in the hero
navLabel: "Ball Pythons",          // small word beside the name in the header
titleSuffix: "Ball Python Breeding", // home page browser tab
tagline: "Your tagline",           // leave "" and both tagline spots disappear
footerBlurb: "One line under your name in the footer",
contact: {
    email: "you@example.com",
    instagramHandle: "@yourhandle",
    instagramUrl: "https://instagram.com/yourhandle",
    pickup: "By appointment — ask for the current collection address.",  // "" hides the row
    reply: "Within 24 hours, usually the same evening."                  // "" hides the row
},
stats: {
    genesInCollection: "34",   // count the genes you actually work with
    quarantine: "60 d"
}
```

The **available count** is not on that list on purpose: it is counted from `data/snakes.js`, so it can never drift from the list.

One thing `site-config.js` cannot reach is the raw HTML that search engines and link previews read before any JavaScript runs: the four `<title>` tags, the three `<meta name="description">` tags, and the crest `alt` text. Do a find-and-replace on "Soulless Serpents" in the four `.html` files to change those too. The page headings and footers update themselves.

## 2. Your animals — live from Supabase (no build step)

Once live publishing is set up, the storefront reads your published list straight from your Supabase project: mark a snake **Available** in The Snake Room, save it, and it is on the shop at the next page load. No CSV, no build, no upload.

**One-time setup, in Supabase:** open the SQL Editor and run `site-tools/storefront-setup.sql` (the For Sale page in the app also shows it with a Copy button). It creates one table, `storefront_shops`, where each shop is a single row: the handle and the public listing document. Row level security means anyone can read a published shop, and only its owner can write it. Nothing else from the collection is in that row.

**In the app:** For Sale page → Storefront contact → fill the name, email, Instagram and the **storefront handle** (for example `soulless-serpents`) → save. Then set the same handle, project URL and publishable key in `js/site-config.js`:

```js
shop: {
    live: true,
    slug: "soulless-serpents",
    supabaseUrl: "https://your-project.supabase.co",
    supabaseKey: "sb_publishable_..."
}
```

The publishable (anon) key is public by design: row level security is what protects the data. Setting `live: false` turns live reading off.

### The static fallback — `data/snakes.js`

Without live publishing (or while the cloud is unreachable, slow, or unconfigured) the site falls back to `data/snakes.js`, which you generate from an export. That route still works and needs no Supabase at all:

Do not write this by hand. In The Snake Room, mark animals **Available** or **On Hold**, fill in the asking price, set your Storefront contact on the For Sale page, export the CSV, then:

```
node site-tools/build-available.js snake-room-collection-YYYY-MM-DD.csv --out soulless-serpents/data/snakes.js
```

That writes one object per animal: morph, genes, sex, hatch date, weight, price, status, notes, feeding, photo path and **your contact details for that listing**. An animal with no contact email is skipped rather than published, so nobody's enquiry lands in the wrong inbox. The live publisher builds exactly the same object in the browser, so both routes produce identical pages.

Different morphs need no code changes. The gene chips, the `?gene=` filter, the search and the "closest available" suggestions all read whatever genes your animals carry. Only a gene the calculator has never heard of needs adding — one line in `js/gene-catalog.js` (the app shares that catalog).

## 3. Photos — `assets/photos/`

Export photos from The Snake Room with the same build, or drop JPEGs in by name and point each animal's `image` at `assets/photos/yourfile.jpg`. A missing file falls back to a styled plate, never a broken image.

## 4. Your writing — `education.html`

The care, genetics and buying guides are generic and fine to keep. The **morph library** ("The genes we work with") is hand-written prose about a specific collection: keep the groups you work with, delete the rest, or delete the whole `#morphs` section.

Also replace `assets/logo.jpg` and the two `alt` texts that describe the crest, and adjust colours in `css/site.css` if you want your own palette.

## 5. Deploy — free, no domain needed

1. Cloudflare dashboard → Workers & Pages → Create → **Upload your static files**.
2. Name the Worker (`your-shop`), drag in the **contents of `soulless-serpents/`** — `index.html`, `css/`, `js/`, `data/`, `assets/` — not the folder itself and not the rest of the repository (the breed app lives outside this folder on purpose).
3. Deploy. You get `https://your-shop.your-subdomain.workers.dev`.
4. Re-upload the same set whenever you rebuild `data/snakes.js` or change settings.

Cloudflare serves clean URLs, so `available.html` redirects to `/available`; links inside the site keep working either way.

## What is not included

No accounts, no cart, no payments. Buyers email the seller listed on the animal they want. Each breeder runs their own copy and owns their own listings — that is the point: one shop's enquiries never reach another shop's inbox.
