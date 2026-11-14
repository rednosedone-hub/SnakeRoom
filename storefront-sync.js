// storefront-sync.js
// Live publishing for the storefront.
//
// The shop's public listings are written to one Supabase row (storefront_shops,
// keyed by the shop's handle). The website reads that row on page load, so
// marking an animal Available is the whole publish step: no CSV, no build, no
// file upload. The row holds only what is already public on the storefront --
// no collection, finance or breeding records.
//
// Nothing here can interrupt a save: publishing runs after the snake is stored
// and every error is swallowed into a status line. If the keeper is offline or
// signed out, the app keeps working and the storefront keeps its last document.

(function () {
    const TABLE = "storefront_shops";
    const LIVE_STATUSES = ["Available", "On Hold"];
    const DEFAULT_IMAGE = "Images/TheSnakeRoom.jpg";

    const SETUP_SQL = [
        "-- The Snake Room: one-time live storefront setup",
        "-- Run once in the Supabase SQL Editor. Safe to run more than once.",
        "",
        "create table if not exists storefront_shops (",
        "  shop_slug text primary key,",
        "  user_id uuid not null references auth.users (id) on delete cascade,",
        "  listings jsonb not null default '{\"updated\": \"\", \"snakes\": []}'::jsonb,",
        "  updated_at timestamptz not null default now()",
        ");",
        "",
        "create index if not exists storefront_shops_user_idx",
        "  on storefront_shops (user_id);",
        "",
        "alter table storefront_shops enable row level security;",
        "",
        "drop policy if exists \"Storefronts are public to read\" on storefront_shops;",
        "create policy \"Storefronts are public to read\"",
        "  on storefront_shops for select",
        "  using (true);",
        "",
        "drop policy if exists \"Keepers publish their own storefront\" on storefront_shops;",
        "create policy \"Keepers publish their own storefront\"",
        "  on storefront_shops for insert to authenticated",
        "  with check (auth.uid () = user_id);",
        "",
        "drop policy if exists \"Keepers update their own storefront\" on storefront_shops;",
        "create policy \"Keepers update their own storefront\"",
        "  on storefront_shops for update to authenticated",
        "  using (auth.uid () = user_id)",
        "  with check (auth.uid () = user_id);",
        "",
        "drop policy if exists \"Keepers clear their own storefront\" on storefront_shops;",
        "create policy \"Keepers clear their own storefront\"",
        "  on storefront_shops for delete to authenticated",
        "  using (auth.uid () = user_id);",
        "",
        "grant select on storefront_shops to anon, authenticated;",
        "grant insert, update, delete on storefront_shops to authenticated;"
    ].join("\n");

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function slugify(value) {
        return window.StorefrontContact
            ? window.StorefrontContact.slugify(value)
            : text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    function shopIdentity() {
        const contact = window.StorefrontContact ? window.StorefrontContact.read() : {};

        return {
            name: text(contact.name),
            email: text(contact.email),
            phone: text(contact.phone),
            instagram: text(contact.instagram),
            slug: slugify(contact.slug || contact.name)
        };
    }

    function genesOf(snake) {
        return (Array.isArray(snake.genes) ? snake.genes : [])
            .map(gene => text(gene && gene.name))
            .filter(name => name && name.toLowerCase() !== "normal");
    }

    // The export puts the inventory code in "morph" when no name was typed, so
    // a code is replaced with one built from the animal's genes -- the same
    // rule site-tools/build-available.js uses.
    function looksLikeCode(value) {
        return /^[A-Za-z]{1,5}-[A-Za-z0-9][A-Za-z0-9-]*$/.test(value);
    }

    function morphOf(snake, genes) {
        const raw = text(snake.morph);
        const code = text(snake.ID);

        if (raw && !looksLikeCode(raw) && raw.toLowerCase() !== code.toLowerCase()) {
            return raw;
        }

        return genes.length ? genes.join(" ") : "Normal";
    }

    function priceOf(snake, status) {
        const asking = Number(snake.askingPrice) || 0;
        const hold = Number(snake.holdPrice) || 0;
        const sale = Number(snake.salePrice) || 0;

        if (status === "hold") return hold || asking || sale;
        if (status === "sold") return sale || hold || asking;
        return asking || sale || hold;
    }

    function notesOf(snake, status) {
        if (status !== "hold") return text(snake.notes);

        if (text(snake.holdNote)) return text(snake.holdNote);
        if (text(snake.holdBuyer)) return "Reserved for " + text(snake.holdBuyer) + ".";
        return "On hold for a buyer.";
    }

    function feedingOf(snake) {
        const interval = Number(snake.feedingIntervalDays) || 0;
        const size = text(snake.feederSize);
        const lastFed = text(snake.lastFed);

        if (!interval && !size) return "";

        let line = "Feeding " + (interval ? "every " + interval + " days" : "regularly");

        if (size) line += " on " + size;
        if (lastFed) line += " (last fed " + lastFed + ")";

        return line.charAt(0).toUpperCase() + line.slice(1) + ".";
    }

    function publicListing(snake, shop) {
        const status = text(snake.status).toLowerCase() === "on hold"
            ? "hold"
            : text(snake.status).toLowerCase() === "sold" ? "sold" : "available";
        const genes = genesOf(snake);
        const image = text(snake.image);

        return {
            id: text(snake.ID) || text(snake.morph) || text(snake.name) || "Unnamed",
            name: text(snake.name),
            morph: morphOf(snake, genes),
            genes: genes,
            sex: text(snake.sex) || "Unknown",
            hatchDate: text(snake.hatchDate).slice(0, 10),
            weight: Number(snake.weight) || 0,
            price: priceOf(snake, status),
            status: status,
            featured: Boolean(snake.featured),
            image: image && image !== DEFAULT_IMAGE ? image : "",
            notes: notesOf(snake, status),
            feeding: feedingOf(snake),
            contactName: shop.name,
            contactEmail: shop.email,
            contactPhone: shop.phone,
            contactInstagram: shop.instagram
        };
    }

    function listingsFor(snakes, shop) {
        const published = snakes
            .filter(snake => LIVE_STATUSES.indexOf(text(snake.status)) !== -1)
            .map(snake => publicListing(snake, shop))
            .sort((a, b) => String(b.hatchDate).localeCompare(String(a.hatchDate)));

        return {
            updated: new Date().toISOString().slice(0, 10),
            snakes: published
        };
    }

    function loadSnakes() {
        return window.SnakeData && typeof window.SnakeData.loadSnakesWithIds === "function"
            ? window.SnakeData.loadSnakesWithIds([])
            : [];
    }

    async function publish() {
        const shop = shopIdentity();

        if (!shop.name || !shop.email) {
            throw new Error("Add the storefront contact details on the For Sale page first.");
        }

        if (!shop.slug) {
            throw new Error("Add a storefront handle so the site can find this shop.");
        }

        if (!window.CloudSync || typeof window.CloudSync._getClient !== "function") {
            throw new Error("Cloud sync is not available on this page.");
        }

        const session = await window.CloudSync.getSession();

        if (!session || !session.user) {
            throw new Error("Sign in first \u2014 publishing writes to your cloud account.");
        }

        const client = window.CloudSync._getClient();

        if (!client) {
            throw new Error("Add your Supabase connection on the Account page first.");
        }

        const listings = listingsFor(loadSnakes(), shop);
        const { error } = await client
            .from(TABLE)
            .upsert({
                shop_slug: shop.slug,
                user_id: session.user.id,
                listings,
                updated_at: new Date().toISOString()
            }, { onConflict: "shop_slug" });

        if (error) {
            if (error.code === "42P01") {
                throw new Error("Storefront table missing \u2014 run the setup SQL once (shown below).");
            }
            if (error.code === "42501" || /permission/i.test(error.message || "")) {
                throw new Error("Database refused the write \u2014 run the setup SQL once (shown below).");
            }
            throw new Error(error.message || "Could not publish.");
        }

        return { count: listings.snakes.length, slug: shop.slug };
    }

    function publishQuietly() {
        publish().catch(() => {});
    }

    // ---- The For Sale page panel -------------------------------------------

    function setStatus(message, isError) {
        const node = document.getElementById("storefrontPublishStatus");

        if (!node) return;

        node.textContent = message;
        node.style.color = isError ? "#ffb4a8" : "";
    }

    function initPanel() {
        const button = document.getElementById("publishStorefrontButton");
        const sqlBlock = document.getElementById("storefrontSetupSql");
        const copyButton = document.getElementById("copyStorefrontSqlButton");

        if (sqlBlock) sqlBlock.textContent = SETUP_SQL;

        if (copyButton) {
            copyButton.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(SETUP_SQL);
                    setStatus("Setup SQL copied. Paste it into the Supabase SQL Editor once.");
                } catch (error) {
                    setStatus("Copy failed \u2014 select the SQL below and copy it by hand.", true);
                }
            });
        }

        if (button) {
            button.addEventListener("click", async () => {
                button.disabled = true;
                setStatus("Publishing\u2026");

                try {
                    const result = await publish();
                    setStatus(
                        "Published " + result.count +
                        (result.count === 1 ? " animal" : " animals") +
                        " to /" + result.slug + ". The site picks it up on the next page load."
                    );
                } catch (error) {
                    setStatus(error.message, true);
                } finally {
                    button.disabled = false;
                }
            });
        }

        window.addEventListener("storefront-contact-changed", publishQuietly);
    }

    window.StorefrontSync = {
        TABLE,
        SETUP_SQL,
        publicListing,
        listingsFor,
        publish,
        publishQuietly,
        shopIdentity
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initPanel);
    } else {
        initPanel();
    }
})();
