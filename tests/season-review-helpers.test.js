const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = { console };

context.window = context;
vm.createContext(context);

// The season review reads snake sales through SnakeFinance, the same way the
// Finances page does, so both files load here.
["finance-helpers.js", "season-review-helpers.js"].forEach(file => {
    vm.runInContext(
        fs.readFileSync(path.join(projectRoot, file), "utf8"),
        context,
        { filename: file }
    );
});

const season = context.window.SeasonReview;

function hatchling(overrides = {}) {
    return {
        id: "h",
        name: "Hatchling",
        status: "Hatchling",
        clutchId: "2026-01",
        clutchToken: "tc1",
        hatchDate: "2026-06-25",
        ...overrides
    };
}

function dataset() {
    return {
        snakes: [
            { id: "dam", name: "Nova", sex: "Female", purchasePrice: "300", purchaseDate: "2026-02-01", purchasedFrom: "Breeder" },
            { id: "sire", name: "Atlas", sex: "Male" },
            { id: "old", name: "Older snake", status: "Sold", salePrice: "200", saleDate: "2026-03-01" },
            hatchling({ id: "h1", name: "Keeper", morph: "Pastel", status: "Holdback" }),
            hatchling({ id: "h2", name: "Buyer Bought", status: "Sold", salePrice: "450", saleDate: "2026-10-01" }),
            // An asking price on an Available animal is not a sale.
            hatchling({ id: "h3", name: "Listed", status: "Available", salePrice: "500" }),
            hatchling({ id: "h4", name: "Growing", status: "Hatchling" }),
            hatchling({ id: "h5", name: "Lost One", status: "Deceased" }),
            hatchling({ id: "h6", name: "Old Clutch", clutchId: "2025-01", clutchToken: "tc3", hatchDate: "2025-07-01", status: "Holdback" })
        ],
        clutches: [
            {
                id: "2026-01",
                clutchToken: "tc1",
                femaleSnakeId: "dam",
                maleSnakeId: "sire",
                laidDate: "2026-05-01",
                hatchedDate: "2026-06-25",
                eggCount: 6,
                hatchlingCount: 5,
                convertedToSnakes: true
            },
            {
                id: "2026-02",
                clutchToken: "tc2",
                femaleSnakeId: "dam",
                maleSnakeId: "sire",
                laidDate: "2026-09-01",
                eggCount: 4
            },
            {
                id: "2025-01",
                clutchToken: "tc3",
                femaleSnakeId: "dam",
                maleSnakeId: "sire",
                laidDate: "2025-05-01",
                hatchedDate: "2025-07-01",
                eggCount: 5,
                hatchlingCount: 1,
                convertedToSnakes: true
            }
        ],
        expenses: [
            { id: "e1", date: "2026-06-01", category: "Feeders", amount: "120", vendor: "Rodent shop" },
            { id: "e2", date: "2026-07-01", category: "Supplies", amount: "80", vendor: "Shop" }
        ],
        expos: [
            { id: "x1", name: "Local Expo", date: "2026-08-01", boothCost: "100", travelCost: "50" }
        ],
        feederPrices: {}
    };
}

test("a season counts its eggs, hatchlings and hatch rate without blaming incubating eggs", () => {
    const result = season.review({ ...dataset(), year: 2026 });

    assert.equal(result.year, 2026);
    assert.equal(result.totals.clutches, 2);
    assert.equal(result.totals.waiting, 1);
    assert.equal(result.totals.eggs, 10);
    assert.equal(result.totals.hatched, 5);
    // The incubating clutch's four eggs are not part of the hatch rate.
    assert.equal(result.totals.completedEggs, 6);
    assert.equal(result.totals.hatchRate, 83.3);
    assert.equal(result.totals.unhatched, 1);
});

test("hatchlings are grouped into kept, for sale, growing, sold and lost", () => {
    const result = season.review({ ...dataset(), year: 2026 });

    assert.equal(result.totals.counts.retained, 1);
    assert.equal(result.totals.counts.forSale, 1);
    assert.equal(result.totals.counts.growing, 1);
    assert.equal(result.totals.counts.sold, 1);
    assert.equal(result.totals.counts.lost, 1);
    assert.equal(result.liveHatchlings, 3);
    assert.equal(result.kept.length, 1);
    assert.equal(result.kept[0].name, "Keeper");
    assert.equal(result.kept[0].morph, "Pastel");
});

test("a hatchling's clutch code is not shown as its morph", () => {
    const data = dataset();

    data.snakes.push(hatchling({
        id: "h7",
        name: "Hatchling 01",
        ID: "2026-01",
        morph: "2026-01",
        status: "Holdback"
    }));

    const result = season.review({ ...data, year: 2026 });
    const summarized = result.kept.find(hatchlingEntry => hatchlingEntry.name === "Hatchling 01");

    assert.equal(summarized.morph, "");
});

test("a price on an Available animal is not counted as a sale", () => {
    const result = season.review({ ...dataset(), year: 2026 });

    // Only the Sold hatchling brought money in; the listed one is inventory.
    assert.equal(result.totals.revenue, 450);
    assert.equal(result.totals.saleCount, 1);
    assert.equal(result.money.sales, 650);
});

test("the season money follows the same events as the Finances page", () => {
    const result = season.review({ ...dataset(), year: 2026 });

    assert.equal(result.money.revenue, 650);
    assert.equal(result.money.spend, 650);
    assert.equal(result.money.net, 0);
    assert.equal(result.money.purchases, 300);
    assert.equal(result.money.feederOrders, 120);
    assert.equal(result.money.showCosts, 150);
    assert.equal(result.money.otherCosts, 80);
    assert.equal(result.breakEven, 216.67);
});

test("another season leaves this season's clutches and sales out", () => {
    const result = season.review({ ...dataset(), year: 2025 });

    assert.equal(result.totals.clutches, 1);
    assert.equal(result.totals.eggs, 5);
    assert.equal(result.totals.counts.retained, 1);
    assert.equal(result.money.revenue, 0);
    assert.equal(result.money.spend, 0);
});

test("a holdback-heavy season that spent money reads as investing, not failing", () => {
    const result = season.review({
        snakes: [
            { id: "dam", name: "Nova" },
            { id: "sire", name: "Atlas" },
            hatchling({ id: "k1", name: "K1", status: "Holdback" }),
            hatchling({ id: "k2", name: "K2", status: "Holdback" }),
            hatchling({ id: "k3", name: "K3", status: "Breeder" }),
            hatchling({ id: "k4", name: "K4", status: "Holdback" }),
            hatchling({ id: "k5", name: "K5", status: "Holdback" })
        ],
        clutches: [{
            id: "2026-01",
            clutchToken: "tc1",
            femaleSnakeId: "dam",
            maleSnakeId: "sire",
            laidDate: "2026-04-01",
            hatchedDate: "2026-06-01",
            eggCount: 8,
            hatchlingCount: 5,
            convertedToSnakes: true
        }],
        expenses: [{ id: "e1", date: "2026-06-01", category: "Feeders", amount: "600" }],
        expos: [],
        year: 2026
    });
    const copy = season.verdict(result, { formatMoney: value => `$${Math.round(value)}` });

    assert.equal(result.money.net, -600);
    assert.equal(copy.tone, "investing");
    assert.match(copy.headline, /\$600 down in cash/);
    assert.match(copy.headline, /5 animals/);
    assert.match(copy.detail, /not a verdict on the season/);
    assert.match(copy.detail, /5 animals are marked Holdback or Breeder/);
});

test("a season with no clutches says so instead of inventing a result", () => {
    const result = season.review({
        snakes: [],
        clutches: [],
        expenses: [],
        expos: [],
        year: 2030
    });
    const copy = season.verdict(result);

    assert.equal(result.totals.clutches, 0);
    assert.equal(copy.tone, "empty");
    assert.match(copy.headline, /No clutches on record for 2030/);
});

test("a sold animal with no price is counted but flagged", () => {
    const result = season.review({
        snakes: [
            hatchling({ id: "s1", name: "Unpriced", status: "Sold" })
        ],
        clutches: [{
            id: "2026-01",
            clutchToken: "tc1",
            laidDate: "2026-04-01",
            hatchedDate: "2026-06-01",
            eggCount: 1,
            hatchlingCount: 1,
            convertedToSnakes: true
        }],
        expenses: [],
        expos: [],
        year: 2026
    });
    const copy = season.verdict(result, { formatMoney: value => `$${value}` });

    assert.equal(result.totals.counts.sold, 1);
    assert.equal(result.totals.saleCount, 0);
    assert.equal(result.totals.soldWithoutPrice, 1);
    assert.match(copy.detail, /no sale price recorded/);
});

test("a season with breeding but no money recorded does not report $0.00 up", () => {
    const result = season.review({
        snakes: [
            hatchling({ id: "k1", name: "K1", status: "Holdback" }),
            hatchling({ id: "k2", name: "K2", status: "Holdback" }),
            hatchling({ id: "k3", name: "K3", status: "Holdback" })
        ],
        clutches: [{
            id: "2026-01",
            clutchToken: "tc1",
            laidDate: "2026-04-01",
            hatchedDate: "2026-06-01",
            eggCount: 3,
            hatchlingCount: 3,
            convertedToSnakes: true
        }],
        expenses: [],
        expos: [],
        year: 2026
    });
    const copy = season.verdict(result, { formatMoney: value => `$${value}` });

    assert.equal(copy.tone, "empty");
    assert.equal(copy.headline, "3 hatchlings from 3 eggs in 2026.");
    assert.match(copy.detail, /No money is recorded for 2026/);
});

test("a returned deposit appears as its own refund line in the season money", () => {
    const result = season.review({
        snakes: [{
            id: "s1",
            name: "Held snake",
            status: "Available",
            holdHistory: [{
                buyer: "Sam",
                deposit: 150,
                depositDate: "2026-05-01",
                releasedDate: "2026-06-01",
                disposition: "return"
            }]
        }],
        clutches: [],
        expenses: [],
        expos: [],
        year: 2026
    });
    const refund = result.money.rows.find(row => row.key === "hold-refund");

    assert.equal(result.money.revenue, 150);
    assert.equal(result.money.spend, 150);
    assert.equal(result.money.net, 0);
    assert.equal(refund.out, 150);
    assert.equal(result.money.otherCosts, 150);
});

test("a plan without money tools leaves cash out of the review entirely", () => {
    const result = season.review({ ...dataset(), year: 2026, includeMoney: false });
    const copy = season.verdict(result, { formatMoney: value => `$${value}` });

    assert.equal(result.money, null);
    assert.equal(result.breakEven, null);
    assert.equal(copy.tone, "breeding");
    assert.match(copy.detail, /money tools are not on this plan/);
    assert.doesNotMatch(copy.detail, /\$/);
});

test("legacy index references still label a pair", () => {
    const pair = season.pairLabel(
        { femaleIndex: 0, maleIndex: 1 },
        [{ name: "Nova" }, { name: "Atlas" }]
    );

    assert.equal(pair, "Nova x Atlas");
});
