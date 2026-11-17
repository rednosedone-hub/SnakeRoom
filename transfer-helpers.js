// transfer-helpers.js
// Handing one animal to another keeper's Snake Room account.
//
// The seller's copy is the authority while a transfer is pending; the buyer
// gets a fresh copy with a fresh local id when they accept. What travels is the
// animal and its history. What never travels is anything about money, buyers,
// bins or the seller's private notes -- the person receiving the snake is
// usually the person who paid for it, and they still do not need the ledger.
//
// Kept free of the browser so the rules can be tested without Supabase.
(function () {
    // Fields that describe a sale, a buyer, a price or this keeper's shelving.
    const PRIVATE_FIELDS = [
        "purchasePrice",
        "purchaseDate",
        "purchasedFrom",
        "acquisitionSource",
        "askingPrice",
        "salePrice",
        "saleDate",
        "soldTo",
        "saleExpoId",
        "holdBuyer",
        "holdPrice",
        "holdDeposit",
        "holdDepositDate",
        "holdDueDate",
        "holdNote",
        "holdPaymentPlan",
        "holdHistory",
        "notes",
        "binNumber",
        "sireId",
        "damId",
        "featured",
        "retiredDate",
        "retiredReason",
        "retiredNote",
        "retiredFromStatus",
        "transferTo",
        "transferId",
        "transferFrom",
        "transferSentAt"
    ];

    // "Available", "On Hold" and "Sold" describe a listing, not an animal. A
    // received animal is owned, so these arrive as a plain adult life stage.
    const SALE_STATUSES = ["Available", "On Hold", "Sold"];

    function text(value) {
        return value === undefined || value === null ? "" : String(value).trim();
    }

    function normalizeEmail(value) {
        return text(value).toLowerCase();
    }

    function isValidEmail(value) {
        const email = normalizeEmail(value);

        // Deliberately loose: the address only has to match a Supabase account,
        // and a picky pattern rejects real addresses far more often than it
        // catches typos.
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
    }

    function webUrl(value) {
        const url = text(value);

        return /^https?:\/\//i.test(url) ? url : "";
    }

    // A local file path means nothing on another machine, so it is dropped
    // rather than arriving as a broken image.
    function publicPhotos(snake) {
        const photos = Array.isArray(snake && snake.photos) ? snake.photos : [];

        return photos
            .map(photo => ({ url: webUrl(photo && photo.url), addedAt: (photo && photo.addedAt) || null }))
            .filter(photo => photo.url);
    }

    function statusForTransfer(snake) {
        const status = text(snake && snake.status);

        if (!status) return "Adult";
        if (SALE_STATUSES.includes(status)) return "Adult";

        return status;
    }

    // Everything a new owner needs, nothing the old one would not show a buyer.
    function sanitizeForTransfer(snake) {
        const source = snake && typeof snake === "object" ? snake : {};
        const copy = {};

        Object.keys(source).forEach(key => {
            if (PRIVATE_FIELDS.includes(key)) return;
            copy[key] = source[key];
        });

        copy.status = statusForTransfer(source);
        copy.image = webUrl(source.image);

        // Keep the gallery only when every entry is already a web address;
        // mixed local paths would render as holes in the new owner's record.
        const photos = publicPhotos(source);
        if (photos.length) {
            copy.photos = photos;
            if (!copy.image) copy.image = photos[0].url;
        } else {
            delete copy.photos;
        }

        copy.feedingHold = source.feedingHold || null;

        return copy;
    }

    function cleanName(value) {
        return text(value).replace(/\s+/g, " ").slice(0, 120);
    }

    // The row that goes into snake_transfers. Supabase fills in the rest.
    function buildTransferRow(options = {}) {
        const snake = sanitizeForTransfer(options.snake);
        const toEmail = normalizeEmail(options.toEmail);

        if (!isValidEmail(toEmail)) {
            return { ok: false, error: "Enter the email address on their Snake Room account." };
        }

        const fromEmail = normalizeEmail(options.fromEmail);
        if (fromEmail && fromEmail === toEmail) {
            return { ok: false, error: "That is your own email address." };
        }

        if (!snake || !text(snake.ID || snake.name)) {
            return { ok: false, error: "Save the snake's record before transferring it." };
        }

        return {
            ok: true,
            row: {
                from_email: fromEmail,
                from_name: cleanName(options.fromName),
                to_email: toEmail,
                snake: snake,
                note: text(options.note).slice(0, 500),
                status: "pending"
            }
        };
    }

    function slug(value) {
        return text(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40);
    }

    function uniqueId(snake, snakes, now) {
        const base = "snake-" + (slug(snake.ID || snake.name) || "animal");
        const taken = new Set((snakes || []).map(item => text(item && item.id)));
        const stamp = Number(now) || Date.now();
        let candidate = `${base}-${stamp.toString(36)}`;
        let counter = 1;

        while (taken.has(candidate)) {
            counter += 1;
            candidate = `${base}-${stamp.toString(36)}-${counter}`;
        }

        return candidate;
    }

    // The receiving side: a fresh id so nothing collides with what the buyer
    // already owns, and a note of where the animal came from.
    function mergeIncoming(snakes, incoming, options = {}) {
        const list = Array.isArray(snakes) ? snakes.slice() : [];
        const source = sanitizeForTransfer(incoming);
        const today = text(options.today) || new Date().toISOString().slice(0, 10);

        source.id = uniqueId(source, list, options.now);
        source.acquiredDate = text(source.acquiredDate) || today;
        source.transferFrom = text(options.fromName || options.fromEmail);

        list.push(source);

        return { snakes: list, snake: source };
    }

    function describe(transfer) {
        const snake = (transfer && transfer.snake) || {};
        const label = cleanName(snake.name) || cleanName(snake.ID) || "Unnamed";

        return {
            label,
            morph: cleanName(snake.morph) || "Normal",
            id: text(snake.ID),
            from: text(transfer && (transfer.from_name || transfer.from_email)),
            to: text(transfer && transfer.to_email),
            status: text(transfer && transfer.status) || "pending",
            created: text(transfer && transfer.created_at).slice(0, 10),
            claimed: text(transfer && transfer.claimed_at).slice(0, 10)
        };
    }

    const api = {
        PRIVATE_FIELDS,
        SALE_STATUSES,
        isValidEmail,
        normalizeEmail,
        sanitizeForTransfer,
        buildTransferRow,
        mergeIncoming,
        describe
    };

    if (typeof window !== "undefined") {
        window.TransferHelpers = api;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
