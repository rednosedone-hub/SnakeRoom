// The public shop must never name a buyer.
//
// Two things publish listings: the browser publisher (storefront-sync.js, which
// writes the Supabase document) and the CSV fallback builder
// (site-tools/build-available.js). The publisher cannot run here without a
// browser and a database, so its source is checked for the private fields, and
// the fallback builder is run for real against an export containing buyers.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BUYERS = ["Alex Buyer", "Sam Deposit"];

test("the browser publisher never reaches for a buyer name or hold note", () => {
    const source = fs.readFileSync(path.join(ROOT, "storefront-sync.js"), "utf8");

    ["holdBuyer", "soldTo", "holdNote", "holdDeposit"].forEach(field => {
        assert.equal(
            source.includes(field),
            false,
            `storefront-sync.js reads ${field}; that value must not travel to the public document`
        );
    });
});

test("the fallback builder publishes held and sold without naming the buyer", () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-privacy-"));
    const csvPath = path.join(workDir, "export.csv");
    const outPath = path.join(workDir, "snakes.js");

    const headers = [
        "id", "name", "ID", "morph", "sex", "status", "hatchDate", "weight",
        "image", "genes", "contactEmail", "askingPrice", "salePrice", "holdPrice",
        "holdBuyer", "holdNote", "soldTo", "feedingIntervalDays", "feederSize", "lastFed"
    ];

    const rows = [
        {
            id: "snake-held", name: "Held One", ID: "SS-201", morph: "Pastel", sex: "Female",
            status: "On Hold", hatchDate: "2026-05-01", weight: "300", genes: "Pastel:codom:1",
            contactEmail: "shop@example.com", holdPrice: "500", holdBuyer: BUYERS[1],
            holdNote: "Deposit by e-transfer, pickup Saturday"
        },
        {
            id: "snake-sold", name: "Sold One", ID: "SS-202", morph: "Clown", sex: "Male",
            status: "Sold", hatchDate: "2026-04-01", weight: "420", genes: "Clown:recessive:2",
            contactEmail: "shop@example.com", salePrice: "900", soldTo: BUYERS[0]
        }
    ];

    const escape = value => `"${String(value).replace(/"/g, '""')}"`;
    const csv = [headers.join(",")]
        .concat(rows.map(row => headers.map(header => escape(row[header] || "")).join(",")))
        .join("\r\n");

    fs.writeFileSync(csvPath, csv, "utf8");

    execFileSync(
        process.execPath,
        [path.join(ROOT, "site-tools", "build-available.js"), csvPath, "--out", outPath, "--include-sold"],
        { cwd: ROOT, stdio: "pipe" }
    );

    const output = fs.readFileSync(outPath, "utf8");

    BUYERS.forEach(buyer => {
        assert.equal(output.includes(buyer), false, `${buyer} was published on the shop`);
    });

    // Price is published on purpose; deposit and pickup talk is not.
    ["e-transfer", "Deposit", "pickup Saturday"].forEach(secret => {
        assert.equal(output.includes(secret), false, `"${secret}" was published on the shop`);
    });

    assert.match(output, /"notes": "On hold for a buyer\."/);
    assert.match(output, /"notes": "Sold\."/);
    assert.match(output, /"price": 900/);
    assert.match(output, /"status": "hold"/);
    assert.match(output, /"status": "sold"/);

    fs.rmSync(workDir, { recursive: true, force: true });
});
