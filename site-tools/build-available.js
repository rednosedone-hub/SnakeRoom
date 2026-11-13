#!/usr/bin/env node
/* ==========================================================================
   Soulless Serpents — build data/snakes.js from a The Snake Room export
   --------------------------------------------------------------------------
   In The Snake Room: Data Tools -> "Export snakes" gives you a CSV.
   Then, from the repository root:

       node site-tools/build-available.js snake-room-collection-2026-11-13.csv

   Options:
       --out <file>      write somewhere other than data/snakes.js
       --include-sold    keep Sold animals too (shown as reference on the site)
       --dry-run         print what would be written, change nothing

   Only snakes whose status is "Available" or "On Hold" are published. Photos
   referenced by a local path are copied into assets/photos so the site stays
   self-contained; remote https photo URLs are linked as they are.
   ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

// This script lives outside the site folder on purpose: everything inside
// soulless-serpents/ is published, and a build tool has no business there.
const REPO_DIR = path.resolve(__dirname, "..");
const SITE_DIR = path.join(REPO_DIR, "soulless-serpents");
const PHOTO_DIR = path.join(SITE_DIR, "assets", "photos");

const STATUS_MAP = {
    "available": "available",
    "on hold": "hold",
    "sold": "sold"
};

const STATUS_ORDER = { available: 0, hold: 1, sold: 2 };

/* ---------- arguments ---------- */

function parseArgs(argv) {
    const options = { csv: "", out: path.join(SITE_DIR, "data", "snakes.js"), includeSold: false, dryRun: false };
    const rest = [];

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--out") {
            options.out = path.resolve(argv[i + 1] || "");
            i += 1;
        } else if (arg === "--include-sold") {
            options.includeSold = true;
        } else if (arg === "--dry-run") {
            options.dryRun = true;
        } else if (arg === "--help" || arg === "-h") {
            options.help = true;
        } else if (!arg.startsWith("--")) {
            rest.push(arg);
        }
    }

    options.csv = rest[0] ? path.resolve(rest[0]) : "";
    return options;
}

function usage() {
    console.log([
        "Usage: node site-tools/build-available.js <export.csv> [options]",
        "",
        "  --out <file>      output path (default: soulless-serpents/data/snakes.js)",
        "  --include-sold    also publish Sold animals",
        "  --dry-run         print the result without writing",
        "",
        "Export the CSV from The Snake Room: Data Tools -> Export snakes."
    ].join("\n"));
}

/* ---------- CSV ---------- */

// RFC 4180: quoted fields may contain commas, escaped quotes and newlines, and
// the heavy JSON history columns in the export rely on all three.
function parseCsv(text) {
    const source = text.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < source.length; i += 1) {
        const char = source[i];

        if (quoted) {
            if (char === '"') {
                if (source[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            quoted = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else if (char !== "\r") {
            field += char;
        }
    }

    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter(row => row.some(cell => String(cell).trim() !== ""));
}

function toObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map(header => header.trim());

    return rows.slice(1).map(cells => {
        const record = {};
        headers.forEach((header, index) => {
            record[header] = cells[index] === undefined ? "" : cells[index];
        });
        record.__cellCount = cells.length;
        return record;
    });
}

/* ---------- field helpers ---------- */

function cell(record, name) {
    if (Object.prototype.hasOwnProperty.call(record, name)) return String(record[name] == null ? "" : record[name]).trim();

    const key = Object.keys(record).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    return key ? String(record[key] == null ? "" : record[key]).trim() : "";
}

function number(value) {
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseGenes(raw) {
    return String(raw || "")
        .split(";")
        .map(entry => entry.split(":")[0].trim())
        .filter(gene => gene && gene.toLowerCase() !== "normal");
}

// The export puts the inventory code in "morph" when no morph name was typed,
// so a value that looks like a code is replaced with one built from its genes.
function looksLikeCode(value) {
    return /^[A-Za-z]{1,5}-[A-Za-z0-9][A-Za-z0-9-]*$/.test(value);
}

function morphName(record, genes) {
    const raw = cell(record, "morph");
    const code = cell(record, "ID");

    if (raw && !looksLikeCode(raw) && raw.toLowerCase() !== code.toLowerCase()) return raw;
    if (genes.length) return genes.join(" ");
    return "Normal";
}

// Available animals show the asking price from their For sale block. An older
// export has no askingPrice column at all, so the agreed/sale prices stay as
// the fallback rather than the card dropping to "$0".
function priceFor(record, status) {
    const asking = number(cell(record, "askingPrice"));
    const sale = number(cell(record, "salePrice"));
    const hold = number(cell(record, "holdPrice"));

    if (status === "sold") return sale || hold || asking;
    if (status === "hold") return hold || asking || sale;
    return asking || sale || hold;
}

function notesFor(record, status) {
    if (status === "hold") {
        const buyer = cell(record, "holdBuyer");
        const note = cell(record, "holdNote");
        if (note) return note;
        if (buyer) return "Reserved for " + buyer + ".";
        return "On hold for a buyer.";
    }

    if (status === "sold") {
        const buyer = cell(record, "soldTo");
        return buyer ? "Sold to " + buyer + "." : "Sold.";
    }

    return "";
}

function feedingFor(record) {
    const interval = number(cell(record, "feedingIntervalDays"));
    const size = cell(record, "feederSize");
    const lastFed = cell(record, "lastFed");

    if (!interval && !size) return "";

    let text = "Feeding " + (interval ? "every " + interval + " days" : "regularly");
    if (size) text += " on " + size;
    if (lastFed) text += " (last fed " + lastFed + ")";
    return text + ".";
}

/* ---------- photos ---------- */

function safeSlug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "animal";
}

function photoFor(record, identity, copied, dryRun) {
    const raw = cell(record, "image");
    if (!raw) return "";

    if (/^https?:\/\//i.test(raw)) return raw;

    const candidates = [
        path.resolve(REPO_DIR, raw),
        path.resolve(path.dirname(record.__csvPath || ""), raw)
    ];
    const source = candidates.find(candidate => candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!source) return "";

    const extension = path.extname(source).toLowerCase() || ".jpg";
    const filename = safeSlug(identity) + extension;
    const destination = path.join(PHOTO_DIR, filename);

    // --dry-run promises to change nothing, so it reports the path the real
    // run would write without copying the file into assets/photos.
    if (dryRun) {
        return "assets/photos/" + filename;
    }

    try {
        fs.mkdirSync(PHOTO_DIR, { recursive: true });
        fs.copyFileSync(source, destination);
        copied.push(filename);
    } catch (error) {
        return "";
    }

    return "assets/photos/" + filename;
}

/* ---------- mapping ---------- */

function toSnake(record, options, copied, skipped) {
    const status = STATUS_MAP[cell(record, "status").toLowerCase()];
    if (!status) return null;
    if (status === "sold" && !options.includeSold) return null;

    // A listing is published in someone's name. Without that seller's contact
    // the buyer has nobody to write to but the shop, so the animal is held back
    // rather than silently borrowing the shop's address.
    const contactEmail = cell(record, "contactEmail") || cell(record, "sellerEmail");
    const contactName = cell(record, "contactName") || cell(record, "sellerName");
    const contactPhone = cell(record, "contactPhone") || cell(record, "sellerPhone");
    const contactInstagram = cell(record, "contactInstagram") || cell(record, "instagram");

    if (!contactEmail) {
        skipped.push(cell(record, "ID") || cell(record, "name") || "Unnamed");
        return null;
    }

    const genes = parseGenes(cell(record, "genes"));
    const id = cell(record, "ID") || cell(record, "morph") || cell(record, "id");
    const name = cell(record, "name");

    const snake = {
        id: id || name || "Unnamed",
        name: name,
        morph: morphName(record, genes),
        genes: genes,
        sex: cell(record, "sex") || "Unknown",
        hatchDate: cell(record, "hatchDate").slice(0, 10),
        weight: number(cell(record, "weight")),
        price: priceFor(record, status),
        status: status,
        image: photoFor(record, identityFor(id, name), copied, options.dryRun),
        notes: notesFor(record, status),
        feeding: feedingFor(record)
    };

    snake.contactEmail = contactEmail;
    if (contactName) snake.contactName = contactName;
    if (contactPhone) snake.contactPhone = contactPhone;
    if (contactInstagram) snake.contactInstagram = contactInstagram;

    return snake;
}

function identityFor(id, name) {
    return id || name || "animal";
}

/* ---------- output ---------- */

function render(snakes, source, today) {
    const header = [
        "/* ==========================================================================",
        "   Soulless Serpents — available animals",
        "   --------------------------------------------------------------------------",
        "   Generated by site-tools/build-available.js from " + source + " on " + today + ".",
        "   Re-run the generator after every fresh export instead of editing by hand.",
        "",
        "   Field reference (same shape either way):",
        "     id, name, morph, genes[], sex, hatchDate (ISO), weight (g), price (USD),",
        "     contactEmail (required \u2014 a listing without one is not published),",
        "     contactName / contactPhone / contactInstagram (shown on the card),",
        "     (price comes from the snake's asking price while Available, its agreed",
        "      price while On Hold, and its sale price once Sold)",
        "     status \"available\" | \"hold\" | \"sold\", image (path or URL), notes, feeding.",
        "   ========================================================================== */",
        ""
    ].join("\n");

    const body = "window.SOULLESS_DATA = " + JSON.stringify({ updated: today, snakes: snakes }, null, 4) + ";\n";

    return header + body;
}

/* ---------- cache busting ---------- */

// Browsers happily reuse a cached data/snakes.js, which would leave the site
// showing last month's animals. After writing, stamp the include so the next
// page load fetches the new file.
function stampDataVersion(stamp) {
    const pages = [path.join(SITE_DIR, "index.html"), path.join(SITE_DIR, "available.html")];

    return pages.filter(page => {
        if (!fs.existsSync(page)) return false;

        const html = fs.readFileSync(page, "utf8");
        const next = html.replace(/(data\/snakes\.js)(\?v=\d+)?/g, "$1?v=" + stamp);
        if (next === html) return false;

        fs.writeFileSync(page, next, "utf8");
        return true;
    });
}

/* ---------- main ---------- */

function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help || !options.csv) {
        usage();
        process.exit(options.help ? 0 : 1);
    }

    if (!fs.existsSync(options.csv)) {
        console.error("Cannot find the export: " + options.csv);
        process.exit(1);
    }

    const text = fs.readFileSync(options.csv, "utf8");
    const rows = parseCsv(text);
    const headerCount = rows.length ? rows[0].length : 0;
    const records = toObjects(rows);
    records.forEach(record => {
        record.__csvPath = options.csv;
    });

    // A hand-edited or reordered export shifts values between columns, which is
    // exactly the kind of mistake that puts a price in the notes cell.
    const ragged = records.filter(record => record.__cellCount !== headerCount);
    if (ragged.length) {
        console.warn(
            "Warning: " + ragged.length + " row(s) do not match the " + headerCount +
            " column header. Prices and morphs on those rows may be wrong."
        );
    }

    const copied = [];
    const skippedForContact = [];
    const snakes = records
        .map(record => toSnake(record, options, copied, skippedForContact))
        .filter(Boolean)
        .sort((a, b) => {
            const status = (STATUS_ORDER[a.status] || 0) - (STATUS_ORDER[b.status] || 0);
            if (status !== 0) return status;
            return String(b.hatchDate).localeCompare(String(a.hatchDate));
        });

    const counts = snakes.reduce((total, snake) => {
        total[snake.status] = (total[snake.status] || 0) + 1;
        return total;
    }, {});

    const today = new Date().toISOString().slice(0, 10);
    const output = render(snakes, path.basename(options.csv), today);

    if (options.dryRun) {
        console.log(output);
    } else {
        fs.mkdirSync(path.dirname(options.out), { recursive: true });
        fs.writeFileSync(options.out, output, "utf8");
        console.log("Wrote " + path.relative(REPO_DIR, options.out));

        const stamped = stampDataVersion(Date.now());
        if (stamped.length) {
            console.log("Stamped the data version in " + stamped.map(page => path.basename(page)).join(" and ") +
                " so browsers pick up the new list.");
        }
    }

    console.log(
        "Published " + snakes.length + " animal(s)" +
        " — available " + (counts.available || 0) +
        ", on hold " + (counts.hold || 0) +
        ", sold " + (counts.sold || 0) + "."
    );

    if (skippedForContact.length) {
        console.warn(
            "Skipped " + skippedForContact.length + " animal(s) with no seller contact: " +
            skippedForContact.slice(0, 8).join(", ") +
            (skippedForContact.length > 8 ? "\u2026" : "") + "\n" +
            "Fill in the Storefront contact on the For Sale page in The Snake Room, then re-export."
        );
    }

    if (copied.length) {
        console.log("Copied " + copied.length + " photo(s) into assets/photos.");
    }

    if (!snakes.length) {
        console.log("Nothing to publish: no snake in that export is marked Available or On Hold.");
        if (!options.includeSold) console.log("(Use --include-sold to publish sold animals as reference.)");
    }
}

main();
