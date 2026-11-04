const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const store = new Map();
const localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
};
const context = { console, localStorage };

context.window = context;
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "finance-helpers.js"), "utf8"),
    context
);

const finance = context.window.SnakeFinance;

function localRows(rows) {
    return Array.from(rows, row => ({ ...row }));
}

test("a feeder order keeps its line items and feeder type", () => {
    store.clear();

    finance.addExpense({
        date: "2026-10-27",
        category: "Feeders",
        vendor: "RodentPro",
        amount: 30,
        note: "10 × Small Rat",
        feederType: "frozen",
        feederLines: [
            { size: "Small Rat", quantity: 10 },
            { size: "Rat Pup", quantity: 4 }
        ]
    });

    const order = finance.getExpenses()[0];

    assert.equal(order.category, "Feeders");
    assert.equal(order.feederType, "frozen");
    assert.deepEqual(localRows(order.feederLines), [
        { size: "Small Rat", quantity: 10 },
        { size: "Rat Pup", quantity: 4 }
    ]);
});

test("an older expense without feeder details still loads cleanly", () => {
    store.clear();
    localStorage.setItem("financeExpenses", JSON.stringify([
        {
            id: "exp-old",
            date: "2026-09-01",
            category: "Feeders",
            vendor: "Shop",
            amount: 20,
            note: "one bag"
        }
    ]));

    const order = finance.getExpenses()[0];

    assert.equal(order.feederType, "");
    assert.deepEqual(localRows(order.feederLines), []);
    assert.equal(order.amount, 20);
});

test("a hold deposit is money in until the snake sells", () => {
    const events = finance.getEvents([
        {
            id: "held-1",
            name: "Luna",
            status: "On Hold",
            holdBuyer: "Sam",
            holdDeposit: "150",
            holdDepositDate: "2026-10-20"
        }
    ], [], []);

    assert.equal(events.length, 1);
    assert.equal(events[0].category, "hold-deposit");
    assert.equal(events[0].direction, "in");
    assert.equal(events[0].amount, 150);
    assert.match(events[0].detail, /Sam/);
});

test("selling replaces the deposit with the full sale price", () => {
    const events = finance.getEvents([
        {
            id: "sold-1",
            name: "Luna",
            status: "Sold",
            salePrice: "400",
            saleDate: "2026-11-01",
            holdDeposit: "150",
            holdDepositDate: "2026-10-20"
        }
    ], [], []);

    assert.equal(events.length, 1);
    assert.equal(events[0].category, "snake-sale");
    assert.equal(events[0].amount, 400);
});

test("a sale marked without a price keeps its deposit on the ledger", () => {
    const events = finance.getEvents([
        {
            id: "sold-noprice",
            name: "Luna",
            status: "Sold",
            saleDate: "2026-11-01",
            holdDeposit: "150",
            holdDepositDate: "2026-10-20"
        }
    ], [], []);

    assert.equal(events.length, 1);
    assert.equal(events[0].category, "snake-sale");
    assert.equal(events[0].amount, 150);
});

test("a released forfeited hold keeps its deposit on the ledger", () => {
    const events = finance.getEvents([
        {
            id: "released-forfeit",
            name: "Luna",
            status: "Available",
            holdHistory: [
                {
                    buyer: "Sam",
                    deposit: 150,
                    depositDate: "2026-10-20",
                    releasedDate: "2026-11-01",
                    disposition: "forfeit"
                }
            ]
        }
    ], [], []);

    assert.equal(events.length, 1);
    assert.equal(events[0].category, "hold-deposit");
    assert.equal(events[0].amount, 150);
    assert.match(events[0].detail, /forfeited/);
});

test("a returned deposit adds a matching refund so the pair nets to zero", () => {
    const events = finance.getEvents([
        {
            id: "released-return",
            name: "Luna",
            status: "Available",
            holdHistory: [
                {
                    buyer: "Sam",
                    deposit: 150,
                    depositDate: "2026-10-20",
                    releasedDate: "2026-11-01",
                    disposition: "return"
                }
            ]
        }
    ], [], []);
    const refund = events.find(event => event.category === "hold-refund");
    const totals = finance.summarize(events);

    assert.equal(events.length, 2);
    assert.equal(refund.direction, "out");
    assert.equal(refund.amount, 150);
    assert.match(refund.detail, /Deposit refund/);
    assert.equal(totals.revenue, 150);
    assert.equal(totals.spend, 150);
    assert.equal(totals.net, 0);
});

test("a transferred deposit stays money in without a refund", () => {
    const events = finance.getEvents([
        {
            id: "released-transfer",
            name: "Luna",
            status: "Available",
            holdHistory: [
                {
                    buyer: "Sam",
                    deposit: 150,
                    depositDate: "2026-10-20",
                    releasedDate: "2026-11-01",
                    disposition: "transfer",
                    transferTo: "Kaa"
                }
            ]
        }
    ], [], []);

    assert.equal(events.length, 1);
    assert.equal(events[0].category, "hold-deposit");
    assert.match(events[0].detail, /transferred/);
});

test("an agreed price on a held snake is not counted as a sale as well", () => {
    const events = finance.getEvents([
        {
            id: "held-2",
            name: "Luna",
            status: "On Hold",
            salePrice: "400",
            holdDeposit: "150",
            holdDepositDate: "2026-10-20"
        }
    ], [], []);

    assert.equal(events.length, 1);
    assert.equal(events[0].category, "hold-deposit");
    assert.equal(events[0].amount, 150);
});

test("an asking price on an unsold snake is not money in", () => {
    const events = finance.getEvents([
        { id: "avail-1", name: "Nova", status: "Available", salePrice: "500" }
    ], [], []);

    assert.equal(events.length, 0);
});

test("a dated sale counts even before the status is changed to Sold", () => {
    const events = finance.getEvents([
        { id: "dated-1", name: "Nova", status: "Available", salePrice: "500", saleDate: "2026-10-01" }
    ], [], []);

    assert.equal(events.length, 1);
    assert.equal(events[0].category, "snake-sale");
    assert.equal(events[0].amount, 500);
});

test("hold grace days default to 30, persist, and reject impossible values", () => {
    store.clear();

    assert.equal(finance.getSettings().holdGraceDays, 30);

    finance.saveSettings({ holdGraceDays: 45 });
    assert.equal(finance.getSettings().holdGraceDays, 45);

    finance.saveSettings({ feederPrices: { "Small Rat": 4 } });
    assert.equal(finance.getSettings().holdGraceDays, 45);

    finance.saveSettings({ holdGraceDays: 0 });
    assert.equal(finance.getSettings().holdGraceDays, 30);

    finance.saveSettings({ holdGraceDays: 500 });
    assert.equal(finance.getSettings().holdGraceDays, 30);
});

test("invalid line quantities are dropped instead of saved", () => {
    store.clear();

    finance.addExpense({
        category: "Feeders",
        amount: 10,
        feederType: "live",
        feederLines: [
            { size: "Small Rat", quantity: 0 },
            { size: "", quantity: 3 },
            { size: "Rat Pup", quantity: "2" }
        ]
    });

    const order = finance.getExpenses()[0];

    assert.equal(order.feederType, "live");
    assert.deepEqual(localRows(order.feederLines), [
        { size: "Rat Pup", quantity: 2 }
    ]);
});
