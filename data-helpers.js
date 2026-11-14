// The full lifecycle, in the order the collection filters show it. Sold,
// Archived and Deceased are terminal: the record and its history stay, but the
// snake is no longer part of the active collection.
const SNAKE_STATUSES = [
    "Hatchling",
    "Juvenile",
    "Sub-Adult",
    "Adult",
    "Breeder",
    "Holdback",
    "Available",
    "On Hold",
    "Sold",
    "Archived",
    "Deceased"
];

const INACTIVE_SNAKE_STATUSES = ["Sold", "Archived", "Deceased"];
const RETIRED_SNAKE_STATUSES = ["Archived", "Deceased"];

function isInactiveSnake(snake) {
    return Boolean(snake) && INACTIVE_SNAKE_STATUSES.includes(String(snake.status || "").trim());
}

function isRetiredStatus(status) {
    return RETIRED_SNAKE_STATUSES.includes(String(status || "").trim());
}

function isRetiredSnake(snake) {
    return Boolean(snake) && isRetiredStatus(snake.status);
}

function isActiveSnake(snake) {
    return !isInactiveSnake(snake);
}

const defaultSnakes = [
    {
        name: "Narcissa",
        morph: "SS-038",
        sex: "Female",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 14,
        feederSize: "",
        status: "Holdback",
        genes: [
            { name: "Chocolate", type: "codom", copies: 1 },
            { name: "Asphalt", type: "codom", copies: 1 }
        ],
        image: "Images/Narcissa/Narcissa1.jpg"
    },
    {
        name: "Artax",
        morph: "Pinstripe Enchi",
        sex: "Male",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Breeder",
        genes: [
            { name: "Pinstripe", type: "codom", copies: 1 },
            { name: "Enchi", type: "codom", copies: 1 }
        ],
        image: "Images/Artax/Artax.jpg"
    },
    {
        name: "Luna",
        morph: "Banana Lesser",
        sex: "Female",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Holdback",
        genes: [
            { name: "Banana", type: "codom", copies: 1 },
            { name: "Lesser", type: "codom", copies: 1 }
        ],
        image: "Images/Luna/Luna.jpg"
    },
    {
        name: "Apple",
        morph: "Caramel Albino",
        sex: "Female",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Holdback",
        genes: [
            { name: "Caramel Albino", type: "recessive", copies: 2 }
        ],
        image: "Images/Apple/Apple.jpg"
    },
    {
        name: "Freckles",
        morph: "Banana Cinnamon",
        sex: "Male",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Breeder",
        genes: [
            { name: "Banana", type: "codom", copies: 1 },
            { name: "Cinnamon", type: "codom", copies: 1 }
        ],
        image: "Images/Freckles/Freckles.jpg"
    },
    {
        name: "Medusa",
        morph: "Cinnamon Enchi",
        sex: "Female",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Breeder",
        genes: [
            { name: "Cinnamon", type: "codom", copies: 1 },
            { name: "Enchi", type: "codom", copies: 1 }
        ],
        image: "Images/Medusa/Medusa.jpg"
    },
    {
        name: "Mel Gibson",
        morph: "Ultramel",
        sex: "Male",
        weight: 0,
        hatchDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: "Breeder",
        genes: [
            { name: "Ultramel", type: "recessive", copies: 2 }
        ],
        image: "Images/MelGibson/MelGibson.jpg"
    }
];

function readStorageArray(key, fallbackValue = []) {
    try {
        const savedItems = JSON.parse(localStorage.getItem(key)) || fallbackValue;
        return Array.isArray(savedItems) ? savedItems : fallbackValue;
    } catch (error) {
        console.error(`Could not load ${key}.`, error);
        return fallbackValue;
    }
}

function saveStorageArray(key, items) {
    localStorage.setItem(key, JSON.stringify(items));
}

// ---- Deleted clutches ------------------------------------------------------
// Deleting a clutch removes its record, but two other copies can write it
// straight back: a cloud backup merged on another device, and a tab that still
// holds the array from before the delete. The clutch id cannot be used to spot
// those, because ids are reused (2026-01 can exist again next year), so the
// record's random token is remembered instead. A clutch created after the
// delete gets a new token and is therefore never hidden.
//
// The remembered tokens are kept for a year and capped, so a very old delete
// cannot quietly suppress anything forever.
const DELETED_CLUTCHES_KEY = "deletedClutches";
const DELETED_CLUTCH_LIMIT = 200;
const DELETED_CLUTCH_MAX_AGE_DAYS = 365;

function readDeletedClutches() {
    try {
        const saved = JSON.parse(localStorage.getItem(DELETED_CLUTCHES_KEY));
        return Array.isArray(saved) ? saved.filter(entry => entry && (entry.token || entry.id)) : [];
    } catch (error) {
        return [];
    }
}

// A record saved before tokens existed still needs a stable key; the legacy
// form can only describe it by id and laid date.
function clutchTokenKey(clutch) {
    if (!clutch) {
        return "";
    }

    const token = String(clutch.clutchToken || "").trim();

    if (token) {
        return token;
    }

    const id = String(clutch.id || "").trim();

    return id ? `legacy:${id}|${String(clutch.laidDate || "").slice(0, 10)}` : "";
}

function saveDeletedClutches(entries) {
    const cutoff = Date.now() - DELETED_CLUTCH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const kept = entries
        .filter(entry => entry && (entry.token || entry.id))
        .filter(entry => {
            const deletedAt = Date.parse(entry.deletedAt || "");

            return !Number.isFinite(deletedAt) || deletedAt >= cutoff;
        })
        .slice(-DELETED_CLUTCH_LIMIT);

    localStorage.setItem(DELETED_CLUTCHES_KEY, JSON.stringify(kept));
}

function rememberDeletedClutch(clutch) {
    const token = clutchTokenKey(clutch);

    if (!token) {
        return;
    }

    const entries = readDeletedClutches().filter(entry =>
        String(entry.token || "") !== token && `legacy:${entry.id}|${entry.laidDate || ""}` !== token
    );

    entries.push({
        token,
        id: String(clutch.id || ""),
        laidDate: String(clutch.laidDate || "").slice(0, 10),
        deletedAt: new Date().toISOString()
    });

    saveDeletedClutches(entries);
}

function isDeletedClutch(clutch, tombstones = readDeletedClutches()) {
    const token = clutchTokenKey(clutch);

    if (!token) {
        return false;
    }

    return tombstones.some(entry =>
        String(entry.token || "") === token
        || `legacy:${entry.id}|${entry.laidDate || ""}` === token
    );
}

function filterDeletedClutches(clutches, tombstones = readDeletedClutches()) {
    if (!Array.isArray(clutches) || tombstones.length === 0) {
        return Array.isArray(clutches) ? clutches : [];
    }

    return clutches.filter(clutch => !isDeletedClutch(clutch, tombstones));
}

// The guard sits on storage itself so every reader is covered: pages, the
// cloud snapshot builder and a restore all see a deleted clutch as gone,
// without each one having to remember to filter.
(function guardDeletedClutches() {
    const nativeGetItem = localStorage.getItem.bind(localStorage);
    const nativeSetItem = localStorage.setItem.bind(localStorage);

    function withoutDeleted(value) {
        if (typeof value !== "string" || value === "") {
            return value;
        }

        try {
            const items = JSON.parse(value);

            if (!Array.isArray(items)) {
                return value;
            }

            const kept = filterDeletedClutches(items);

            return kept.length === items.length ? value : JSON.stringify(kept);
        } catch (error) {
            return value;
        }
    }

    localStorage.getItem = function (key) {
        const value = nativeGetItem(key);

        return String(key) === "clutches" ? withoutDeleted(value) : value;
    };

    localStorage.setItem = function (key, value) {
        return nativeSetItem(key, String(key) === "clutches" ? withoutDeleted(value) : value);
    };
})();

function getSnakeIdentityText(snake) {
    return snake.ID || snake.morph || snake.name || "Unknown snake";
}

function createSnakeId(snake, index) {
    const source = `${snake.name || "snake"}-${getSnakeIdentityText(snake)}-${index}`;
    const slug = source
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);

    return `snake-${slug || index}-${Date.now().toString(36)}`;
}

function ensureSnakeIds(snakes) {
    let changed = false;

    const migratedSnakes = snakes.map((snake, index) => {
        if (snake.id) {
            return snake;
        }

        changed = true;
        return {
            ...snake,
            id: createSnakeId(snake, index)
        };
    });

    return {
        snakes: migratedSnakes,
        changed
    };
}

function loadSnakesWithIds(fallbackValue = []) {
    const loadedSnakes = readStorageArray("snakes", fallbackValue);
    const migration = ensureSnakeIds(loadedSnakes);

    if (migration.changed) {
        saveStorageArray("snakes", migration.snakes);
    }

    return migration.snakes;
}

function findSnakeIndexById(snakes, snakeId) {
    return snakes.findIndex(snake => snake.id === snakeId);
}

function getSnakeByReference(snakes, reference) {
    if (!reference && reference !== 0) {
        return null;
    }

    if (typeof reference === "number") {
        return snakes[reference] || null;
    }

    const index = findSnakeIndexById(snakes, String(reference));
    return index >= 0 ? snakes[index] : null;
}

function getSnakeLabelByReference(snakes, reference) {
    const snake = getSnakeByReference(snakes, reference);

    if (!snake) {
        return "Unknown snake";
    }

    return `${snake.name || "Unnamed"} - ${getSnakeIdentityText(snake)}`;
}

function getSnakeProfileUrl(snake) {
    const path = window.location.pathname.replace(/[^/]*$/, "snake-form.html");
    const baseUrl = `${window.location.origin}${path}`;
    return `${baseUrl}?uid=${encodeURIComponent(snake.id || "")}`;
}

// One link style for an animal's name anywhere in the app. Pages pass the snake
// record so the label and the profile URL can never point at different animals.
function getSnakeLinkHtml(snake, options = {}) {
    if (!snake) {
        return "";
    }

    const escape = value => String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const label = options.label === undefined
        ? (snake.name || getSnakeIdentityText(snake) || "Unnamed")
        : options.label;

    return `<a class="snake-link" href="${escape(getSnakeProfileUrl(snake))}">${escape(label)}</a>`;
}

function getSnakeQrData(snake) {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        return getSnakeProfileUrl(snake);
    }

    return [
        "The Snake Room",
        `Name: ${snake.name || "Unnamed"}`,
        `ID: ${getSnakeIdentityText(snake)}`,
        `Sex: ${snake.sex || "Unknown"}`,
        `Status: ${snake.status || "No status"}`
    ].join("\n");
}

function getQrImageUrl(data, size = 160) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

function getSnakeQrImageUrl(snake, size = 160) {
    return getQrImageUrl(getSnakeQrData(snake), size);
}

// The hatchling record is what a buyer is handed, so its QR points at the
// record rather than the keeper's edit page.
function getHatchlingRecordUrl(snake) {
    const path = window.location.pathname.replace(/[^/]*$/, "hatchling-record.html");
    return `${window.location.origin}${path}?id=${encodeURIComponent((snake && snake.id) || "")}`;
}

// The record as a buyer should meet it: a public page on the shop's own site,
// which needs no account. Empty when the keeper has not set their address.
function getHatchlingRecordPublicUrl(snake) {
    const contact = window.StorefrontContact && typeof window.StorefrontContact.read === "function"
        ? window.StorefrontContact.read()
        : {};
    const base = String((contact && contact.siteUrl) || "").replace(/\/+$/, "");

    if (!base) {
        return "";
    }

    // The listing's public id is its inventory code, which is what the site
    // publishes and what its record link matches on.
    const id = String((snake && snake.ID) || (snake && snake.id) || "").trim();

    return `${base}/available.html?record=${encodeURIComponent(id)}`;
}

function getHatchlingRecordQrData(snake) {
    const publicUrl = getHatchlingRecordPublicUrl(snake);

    if (publicUrl) {
        return publicUrl;
    }

    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        return getHatchlingRecordUrl(snake);
    }

    // Opened from a file, a URL would be useless to a phone, so the code carries
    // the animal's details instead.
    return [
        "The Snake Room",
        `Hatchling record: ${(snake && snake.name) || "Unnamed"}`,
        `ID: ${getSnakeIdentityText(snake)}`,
        `Sex: ${(snake && snake.sex) || "Unknown"}`
    ].join("\n");
}

function getHatchlingRecordQrImageUrl(snake, size = 160) {
    return getQrImageUrl(getHatchlingRecordQrData(snake), size);
}

window.SnakeData = {
    defaultSnakes,
    SNAKE_STATUSES,
    INACTIVE_SNAKE_STATUSES,
    RETIRED_SNAKE_STATUSES,
    isInactiveSnake,
    isRetiredStatus,
    isRetiredSnake,
    isActiveSnake,
    readStorageArray,
    saveStorageArray,
    readDeletedClutches,
    rememberDeletedClutch,
    isDeletedClutch,
    filterDeletedClutches,
    clutchTokenKey,
    getSnakeIdentityText,
    createSnakeId,
    ensureSnakeIds,
    loadSnakesWithIds,
    findSnakeIndexById,
    getSnakeByReference,
    getSnakeLabelByReference,
    getSnakeProfileUrl,
    getSnakeLinkHtml,
    getSnakeQrData,
    getSnakeQrImageUrl,
    getQrImageUrl,
    getHatchlingRecordUrl,
    getHatchlingRecordQrImageUrl,
    getHatchlingRecordPublicUrl
};
