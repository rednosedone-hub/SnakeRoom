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
context.SnakeData = {
    isInactiveSnake: snake => ["Sold", "Archived", "Deceased"].includes(String(snake.status || ""))
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "feeder-inventory.js"), "utf8"),
    context
);

const feeders = context.window.SnakeFeeders;
const TODAY = "2026-10-27";

function snake(overrides = {}) {
    return {
        id: "snake-1",
        name: "Test snake",
        status: "Breeder",
        feederSize: "Small Rat",
        lastFed: "2026-10-20",
        feedingIntervalDays: "7",
        ...overrides
    };
}

function inventory(overrides = {}) {
    return {
        mode: "frozen",
        horizonDays: 30,
        leadDays: 7,
        ...overrides
    };
}

function forecastFor(snakes, stock = [], settings = inventory()) {
    return feeders.buildForecast({
        snakes,
        inventory: stock,
        settings,
        today: TODAY
    });
}

function sizeRow(result, size) {
    return result.sizes.find(row => row.size === size);
}

test("frozen forecast counts meals and suggests an order before stock runs out", () => {
    const result = forecastFor(
        [snake()],
        [{ size: "Small Rat", onHand: 2, reorderAt: 1 }]
    );
    const row = sizeRow(result, "Small Rat");

    // Meals on 27 Oct, 3, 10, 17 and 24 Nov: five in the 30-day window.
    assert.equal(row.need, 5);
    assert.equal(row.nextDate, TODAY);
    assert.equal(row.nextCount, 1);
    assert.equal(row.runsOutDate, "2026-11-03");
    assert.equal(row.orderByDate, "2026-10-27");
    assert.equal(row.orderNow, true);
    assert.equal(row.status, "order");
    // Five for the window, plus one buffer, minus the two already in stock.
    assert.equal(row.suggestedOrder, 4);
});

test("stock that covers the window needs no order", () => {
    const result = forecastFor(
        [snake()],
        [{ size: "Small Rat", onHand: 50, reorderAt: 5 }]
    );
    const row = sizeRow(result, "Small Rat");

    assert.equal(row.need, 5);
    assert.equal(row.runsOutDate, "");
    assert.equal(row.orderByDate, "");
    assert.equal(row.status, "ok");
    assert.equal(row.suggestedOrder, 0);
});

test("a future run-out inside the window is a watch, not an order now", () => {
    const result = forecastFor(
        [snake()],
        [{ size: "Small Rat", onHand: 3, reorderAt: 0 }]
    );
    const row = sizeRow(result, "Small Rat");

    // Third meal is 10 Nov, so with a seven-day lead the order is due 3 Nov.
    assert.equal(row.runsOutDate, "2026-11-10");
    assert.equal(row.orderByDate, "2026-11-03");
    assert.equal(row.orderNow, false);
    assert.equal(row.status, "watch");
    assert.equal(row.suggestedOrder, 2);
});

test("a size below its keep-at-least line asks for a top-up even when covered", () => {
    const result = forecastFor(
        [snake()],
        [{ size: "Small Rat", onHand: 8, reorderAt: 10 }]
    );
    const row = sizeRow(result, "Small Rat");

    assert.equal(row.status, "watch");
    assert.equal(row.suggestedOrder, 7);
});

test("live mode ignores stock and buys for the next feeding", () => {
    const result = forecastFor(
        [snake({ lastFed: "2026-10-26" })],
        [{ size: "Small Rat", onHand: 100, reorderAt: 5 }],
        inventory({ mode: "live", leadDays: 7 })
    );
    const row = sizeRow(result, "Small Rat");

    assert.equal(result.mode, "live");
    assert.equal(row.onHand, 100);
    assert.equal(row.status, "order");
    assert.equal(row.orderByDate, "2026-11-02");
    assert.equal(row.nextDate, "2026-11-02");
    assert.equal(row.suggestedOrder, 1);
    assert.equal(row.need, 4);
});

test("live mode with a short lead time waits for a feeding further out", () => {
    const result = forecastFor(
        [snake({ lastFed: "2026-10-26" })],
        [],
        inventory({ mode: "live", leadDays: 3 })
    );

    assert.equal(sizeRow(result, "Small Rat").status, "ok");
});

test("an overdue snake is counted from today, not from a pile of missed meals", () => {
    const result = forecastFor([snake({ lastFed: "2026-09-01" })]);
    const sizes = sizeRow(result, "Small Rat");

    assert.equal(sizes.events[0].date, TODAY);
    assert.equal(sizes.events[1].date, "2026-11-03");
    assert.ok(sizes.events.length <= 6);
    assert.equal(result.endDate, "2026-11-25");
});

test("animals without a size or a feeding date are reported, not guessed", () => {
    const result = forecastFor([
        snake({ id: "a", name: "No size", feederSize: "" }),
        snake({ id: "b", name: "Never fed", lastFed: "" }),
        snake({ id: "c", name: "On hold", feedingHold: { reason: "Ovulation", since: "2026-10-01" } }),
        snake({ id: "d", name: "Sold snake", status: "Sold" })
    ]);

    assert.deepEqual(Array.from(result.skipped.noFeederSize), ["No size"]);
    assert.deepEqual(Array.from(result.skipped.noFeedingDate), ["Never fed"]);
    assert.deepEqual(Array.from(result.skipped.onHold), ["On hold"]);
    assert.equal(result.skipped.inactive, 1);
    assert.equal(result.events.length, 0);
    assert.equal(result.sizes.length, 0);
});

test("meal totals also report how many snakes they came from", () => {
    const result = feeders.buildForecast({
        snakes: [
            snake({ id: "a", name: "A" }),
            snake({ id: "b", name: "B", feederSize: "Rat Pup", lastFed: "2026-10-25" })
        ],
        inventory: [],
        settings: inventory({ horizonDays: 14 }),
        today: TODAY
    });

    // A 14-day window is today plus the next 13 days: 27 Oct to 9 Nov.
    // A gets 27 Oct and 3 Nov; B gets 1 and 8 Nov.
    assert.equal(result.totals.feedings, 4);
    assert.equal(result.totals.snakes, 2);
    assert.equal(result.totals.sizes, 2);
});

test("a two-week window is fourteen days, not fifteen", () => {
    const result = forecastFor(
        [
            snake({ id: "a", name: "A", lastFed: "2026-10-13", feedingIntervalDays: "14" }),
            snake({ id: "b", name: "B", feederSize: "Rat Pup", lastFed: "2026-10-13", feedingIntervalDays: "14" })
        ],
        [],
        inventory({ horizonDays: 14 })
    );

    assert.equal(result.endDate, "2026-11-09");
    // Both are due today and next on 10 Nov, outside the window, so two snakes
    // fed every two weeks mean two meals in a two-week window.
    assert.equal(result.totals.feedings, 2);
    assert.equal(result.totals.snakes, 2);
});

test("a missing feeding interval falls back to weekly", () => {
    const result = forecastFor([snake({ feedingIntervalDays: "" })]);

    assert.equal(sizeRow(result, "Small Rat").events[1].date, "2026-11-03");
});

test("the plan groups meals by day with the snakes that need them", () => {
    const result = forecastFor([
        snake({ id: "a", name: "A", lastFed: "2026-10-20" }),
        snake({ id: "b", name: "B", lastFed: "2026-10-20" })
    ]);
    const row = sizeRow(result, "Small Rat");

    assert.equal(row.byDate[0].date, TODAY);
    assert.equal(row.byDate[0].count, 2);
    assert.deepEqual(Array.from(row.byDate[0].snakes), ["A", "B"]);
});

test("frozen stock adds, consumes, restores, and respects the keep-at-least line", () => {
    store.clear();
    feeders.saveSettings({ mode: "frozen" });
    feeders.setStock("Small Rat", 10, 3);

    assert.deepEqual(
        Array.from(feeders.getInventory(), row => ({ ...row })),
        [{ size: "Small Rat", onHand: 10, reorderAt: 3 }]
    );

    feeders.addStock("Small Rat", 5);
    assert.equal(feeders.getInventory()[0].onHand, 15);

    const consumed = feeders.consumeFeeders([
        { size: "small rat", quantity: 2 },
        { size: "Large Rat", quantity: 1 }
    ]);

    assert.deepEqual(consumed, [true, false]);
    assert.equal(feeders.getInventory()[0].onHand, 13);

    feeders.restoreFeeder("Small Rat", 1);
    assert.equal(feeders.getInventory()[0].onHand, 14);

    feeders.addStock("Rat Pup", 20);
    assert.equal(feeders.getInventory().length, 2);
    assert.equal(feeders.getInventory().find(row => row.size === "Rat Pup").onHand, 20);
});

test("live mode never changes stock", () => {
    store.clear();
    feeders.saveSettings({ mode: "live" });
    feeders.setStock("Small Rat", 10, 0);

    assert.equal(feeders.consumeFeeder("Small Rat"), false);
    assert.equal(feeders.restoreFeeder("Small Rat", 1), false);
    assert.equal(feeders.getInventory()[0].onHand, 10);
});

test("settings are validated and defaults survive bad input", () => {
    store.clear();

    const saved = feeders.saveSettings({ mode: "nonsense", horizonDays: 999, leadDays: -4 });

    assert.equal(saved.mode, "frozen");
    assert.equal(saved.horizonDays, 30);
    assert.equal(saved.leadDays, 7);
    assert.deepEqual(feeders.getSettings(), saved);
});

test("feeder sizes are collected once even when casing differs", () => {
    const sizes = feeders.collectSizes(
        [{ feederSize: "small rat" }, { feederSize: "Rat Pup" }],
        [{ size: "Small Rat", onHand: 4, reorderAt: 0 }],
        true
    );

    assert.equal(sizes.filter(size => size.toLowerCase() === "small rat").length, 1);
    assert.ok(sizes.includes("Rat Pup"));
    assert.ok(sizes.includes("Medium Rat"));
});

test("an empty freezer asks for the whole forecast window", () => {
    const result = forecastFor([snake()], []);
    const row = sizeRow(result, "Small Rat");

    assert.equal(row.onHand, 0);
    assert.equal(row.status, "order");
    assert.equal(row.suggestedOrder, 5);
});

test("unknown stored inventory rows are ignored instead of crashing the forecast", () => {
    store.clear();
    localStorage.setItem("feederInventory", JSON.stringify({
        "Small Rat": { onHand: "4", reorderAt: "2" },
        "": { onHand: 9 }
    }));

    assert.deepEqual(
        Array.from(feeders.getInventory(), row => ({ ...row })),
        [{ size: "Small Rat", onHand: 4, reorderAt: 2 }]
    );
});
