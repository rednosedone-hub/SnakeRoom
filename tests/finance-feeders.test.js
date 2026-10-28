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
