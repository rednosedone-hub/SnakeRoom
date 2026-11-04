const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const storage = new Map();
const context = {
    console,
    localStorage: {
        getItem: key => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key),
        clear: () => storage.clear()
    }
};

context.window = context;
vm.createContext(context);

["finance-helpers.js", "sales-helpers.js", "data-helpers.js", "buyer-helpers.js"].forEach(file => {
    vm.runInContext(
        fs.readFileSync(path.join(projectRoot, file), "utf8"),
        context,
        { filename: file }
    );
});

const B = context.window.SnakeBuyers;
const TODAY = "2026-11-03";

function buyer(overrides = {}) {
    return {
        id: "buyer-sam",
        name: "Sam",
        email: "sam@example.com",
        phone: "555-0100",
        source: "expo",
        sourceDetail: "Toronto show",
        notes: "",
        createdAt: "2026-09-01",
        updatedAt: "2026-09-01",
        ...overrides
    };
}

function soldSnake(overrides = {}) {
    return {
        id: "snake-1",
        name: "Luna",
        status: "Sold",
        soldTo: "Sam",
        salePrice: "400",
        saleDate: "2026-10-01",
        ...overrides
    };
}

test("the buyer directory adds, rejects duplicate names and updates a contact", () => {
    storage.clear();

    const first = B.addBuyer({
        name: "  Sam   Rivers ",
        email: "sam@example.com",
        source: "expo",
        sourceDetail: "Toronto show"
    });

    assert.equal(first.error, "");
    assert.equal(first.buyer.name, "Sam Rivers");
    assert.equal(first.buyer.source, "expo");

    const duplicate = B.addBuyer({ name: "sam rivers", email: "other@example.com" });

    assert.equal(duplicate.buyer, null);
    assert.match(duplicate.error, /already in the directory/);

    const updated = B.updateBuyer(first.buyer.id, {
        name: "Sam Rivera",
        phone: "555-0199"
    });

    assert.equal(updated.error, "");
    assert.equal(updated.buyer.name, "Sam Rivera");
    assert.equal(updated.buyer.email, "sam@example.com");
    assert.equal(updated.buyer.phone, "555-0199");

    assert.equal(B.getBuyers().length, 1);
    assert.equal(B.removeBuyer(first.buyer.id), true);
    assert.equal(B.getBuyers().length, 0);
});

test("a buyer summary collects purchases, active holds and previous holds by name", () => {
    const summary = B.summarizeBuyer(buyer(), [
        soldSnake(),
        {
            id: "snake-2",
            name: "Nova",
            status: "On Hold",
            holdBuyer: "sam",
            holdPrice: "500",
            holdDeposit: "100",
            holdDueDate: "2026-11-20",
            holdHistory: [
                {
                    buyer: "Sam",
                    deposit: 50,
                    releasedDate: "2026-08-01",
                    disposition: "forfeit"
                }
            ]
        },
        soldSnake({ id: "snake-3", name: "Someone else's", soldTo: "Alex" }),
        { id: "snake-4", name: "Mango", status: "Available", soldTo: "Sam", salePrice: "300" }
    ], { today: TODAY, graceDays: 30 });

    assert.equal(summary.purchaseCount, 1);
    assert.equal(summary.totalSpent, 400);
    assert.equal(summary.activeHoldCount, 1);
    assert.equal(summary.depositTotal, 100);
    assert.equal(summary.balanceTotal, 400);
    assert.equal(summary.releasedHolds.length, 1);
    assert.equal(summary.lastSaleDate, "2026-10-01");
    assert.equal(summary.activeHolds[0].snake.name, "Nova");
});

test("source totals keep a repeat buyer with the channel that first found them", () => {
    const buyers = [
        buyer({ createdAt: "2026-01-10" }),
        buyer({
            id: "buyer-alex",
            name: "Alex",
            source: "word-of-mouth",
            createdAt: "2025-05-01"
        })
    ];
    const snakes = [
        soldSnake(),
        soldSnake({ id: "snake-2", name: "Echo", soldTo: "Alex", salePrice: "150", saleDate: "2025-06-01" }),
        soldSnake({ id: "snake-3", name: "Jade", soldTo: "Sam", salePrice: "300", saleDate: "2026-10-15" }),
        soldSnake({ id: "snake-4", name: "Unlinked", soldTo: "Jordan", salePrice: "50", saleDate: "2026-10-20" })
    ];
    const allTime = B.summarizeSources(buyers, snakes);

    assert.equal(allTime.totalRevenue, 900);
    assert.equal(allTime.totalSales, 4);
    assert.equal(allTime.rows[0].source, "expo");
    assert.equal(allTime.rows[0].sales, 2);
    assert.equal(allTime.rows[0].revenue, 700);
    assert.equal(allTime.rows[0].averageSale, 350);
    assert.equal(allTime.rows.find(row => row.source === "unlinked").revenue, 50);
    assert.equal(allTime.linkedSales, 3);

    const thisYear = B.summarizeSources(buyers, snakes, { year: "2026" });

    assert.equal(thisYear.totalRevenue, 750);
    assert.equal(thisYear.rows.find(row => row.source === "word-of-mouth"), undefined);
    assert.equal(thisYear.rows.find(row => row.source === "expo").buyers, 1);
});

test("names on a sale that are missing from the directory are listed, then link once added", () => {
    storage.clear();

    const unlinked = B.listUnlinkedNames([], [
        soldSnake({ soldTo: "Taylor" }),
        {
            id: "snake-2",
            name: "Nova",
            status: "On Hold",
            holdBuyer: "Sam",
            holdPrice: "500",
            holdDeposit: "100"
        }
    ]);

    assert.equal(unlinked.length, 2);
    assert.equal(unlinked[0].name, "Taylor");
    assert.equal(unlinked[0].saleCount, 1);
    assert.equal(unlinked[0].revenue, 400);
    assert.equal(unlinked[1].holdCount, 1);

    const added = B.addBuyer({ name: "Taylor", source: "kijiji" });

    assert.equal(added.error, "");

    const remaining = B.listUnlinkedNames(B.getBuyers(), [
        soldSnake({ soldTo: "Taylor" }),
        {
            id: "snake-2",
            name: "Nova",
            status: "On Hold",
            holdBuyer: "Sam",
            holdPrice: "500",
            holdDeposit: "100"
        }
    ]).map(entry => entry.name);

    assert.equal(remaining.length, 1);
    assert.equal(remaining[0], "Sam");
});

test("renaming a buyer carries sales, current holds and hold history with it", () => {
    const snakes = [
        soldSnake(),
        {
            id: "snake-2",
            name: "Nova",
            holdBuyer: "sam",
            holdHistory: [
                { buyer: "Sam", deposit: 50 },
                { buyer: "Alex", deposit: 25 }
            ]
        }
    ];
    const renamed = B.renameBuyerInSnakes(snakes, "Sam", "Sam Rivers");

    assert.equal(renamed[0].soldTo, "Sam Rivers");
    assert.equal(renamed[1].holdBuyer, "Sam Rivers");
    assert.deepEqual(renamed[1].holdHistory.map(entry => entry.buyer), ["Sam Rivers", "Alex"]);
    assert.equal(snakes[0].soldTo, "Sam", "the original records are not mutated");
});

test("the printable statement contains purchases and holds but never the private note", () => {
    const summary = B.summarizeBuyer(buyer({
        name: "Sam <Rivers>",
        notes: "Flakey about pickup — call first"
    }), [
        soldSnake({ soldTo: "Sam <Rivers>" }),
        {
            id: "snake-2",
            name: "Nova",
            status: "On Hold",
            holdBuyer: "Sam <Rivers>",
            holdPrice: "500",
            holdDeposit: "100",
            holdDueDate: "2026-11-20"
        }
    ], { today: TODAY, graceDays: 30 });
    const html = B.buildBuyerStatementHtml(summary, {
        today: TODAY,
        formatMoney: value => `$${Number(value).toFixed(2)}`
    });

    assert.match(html, /Sam &lt;Rivers&gt;/);
    assert.match(html, /sam@example\.com/);
    assert.doesNotMatch(html, /Toronto show/);
    assert.match(html, /Luna/);
    assert.match(html, /\$400\.00/);
    assert.match(html, /\$100\.00/);
    assert.match(html, /Print \/ save as PDF/);
    assert.doesNotMatch(html, /Flakey about pickup/);
    assert.doesNotMatch(html, /<Rivers>/);
});
