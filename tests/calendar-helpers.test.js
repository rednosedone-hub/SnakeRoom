const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = { console };

context.window = context;
context.SnakeData = {
    isInactiveSnake: snake => ["Sold", "Archived", "Deceased"].includes(String(snake.status || ""))
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "calendar-helpers.js"), "utf8"),
    context
);

const calendar = context.window.CalendarTools;
const TODAY = "2026-10-28";

function snake(overrides = {}) {
    return {
        id: "snake-1",
        name: "Nova",
        status: "Breeder",
        feederSize: "Small Rat",
        lastFed: "2026-10-20",
        feedingIntervalDays: "7",
        ...overrides
    };
}

test("the month grid starts on Sunday and covers six weeks", () => {
    const grid = calendar.buildMonthGrid(2026, 9, TODAY);

    assert.equal(grid.length, 42);
    assert.equal(grid[0].date, "2026-09-27");
    assert.equal(grid[0].inMonth, false);
    assert.equal(grid[4].date, "2026-10-01");
    assert.equal(grid[4].inMonth, true);
    assert.equal(grid[31].date, "2026-10-28");
    assert.equal(grid[31].isToday, true);
    assert.equal(grid[41].date, "2026-11-07");
});

test("a feeding due in the past is pinned to today and marked overdue", () => {
    const tasks = calendar.collectTasks({
        snakes: [snake({ lastFed: "2026-10-10" })],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });
    const feedings = tasks.filter(task => task.type === "feeding");

    assert.equal(feedings[0].date, TODAY);
    assert.equal(feedings[0].overdue, true);
    // The next meals follow the snake's interval after today.
    assert.deepEqual(
        Array.from(feedings.slice(1, 4), task => task.date),
        ["2026-11-04", "2026-11-11", "2026-11-18"]
    );
});

test("a held or retired snake has no feeding tasks", () => {
    const tasks = calendar.collectTasks({
        snakes: [
            snake({ feedingHold: { reason: "Ovulation" } }),
            snake({ id: "snake-2", name: "Retired", status: "Sold" })
        ],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });

    assert.equal(tasks.filter(task => task.type === "feeding").length, 0);
});

test("health tasks include an overdue quarantine and an open follow-up", () => {
    const health = {
        getQuarantineStatus: () => ({
            active: true,
            end: "2026-10-25",
            label: "Release date passed 3 days ago"
        }),
        getHealthHistory: () => ([
            { type: "Respiratory", followUpDate: "2026-11-02", resolvedDate: "" },
            { type: "Old check", followUpDate: "2026-09-01", resolvedDate: "2026-09-02" }
        ])
    };
    const tasks = calendar.collectTasks({
        snakes: [snake()],
        health,
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });
    const healthTasks = tasks.filter(task => task.type === "health");

    assert.equal(healthTasks.length, 2);
    assert.equal(healthTasks[0].date, TODAY);
    assert.equal(healthTasks[0].overdue, true);
    assert.equal(healthTasks[1].date, "2026-11-02");
    assert.equal(healthTasks[1].overdue, false);
});

test("a clutch's hatch window lands 55 days after it was laid", () => {
    const tasks = calendar.collectTasks({
        clutches: [{ id: "2026-01", laidDate: "2026-09-20", eggCount: 6 }],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-12-31"
    });
    const breeding = tasks.find(task => task.type === "breeding");

    assert.equal(breeding.date, "2026-11-14");
    assert.match(breeding.title, /Hatch window opens/);
    assert.match(breeding.href, /breedingOutcomes\.html#clutch-2026-01/);
});

test("a feeder order appears on its re-order date, and overdue orders land today", () => {
    const tasks = calendar.collectTasks({
        forecast: {
            mode: "frozen",
            sizes: [
                { size: "Small Rat", suggestedOrder: 7, status: "order", orderByDate: "2026-10-20", nextDate: TODAY, runsOutDate: TODAY },
                { size: "Medium Rat", suggestedOrder: 4, status: "watch", orderByDate: "2026-11-01", nextDate: "2026-11-08", runsOutDate: "2026-11-08" },
                { size: "Large Rat", suggestedOrder: 0, status: "ok", orderByDate: "", nextDate: "" }
            ]
        },
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });
    const orders = tasks.filter(task => task.type === "order");

    assert.equal(orders.length, 2);
    assert.equal(orders[0].date, TODAY);
    assert.equal(orders[0].overdue, true);
    assert.equal(orders[1].date, "2026-11-01");
    assert.equal(orders[1].overdue, false);
});

test("tasks are sorted by date and then by type", () => {
    const tasks = calendar.collectTasks({
        snakes: [snake({ lastFed: "2026-10-21" })],
        forecast: {
            mode: "frozen",
            sizes: [{ size: "Small Rat", suggestedOrder: 2, status: "order", orderByDate: TODAY, nextDate: TODAY }]
        },
        today: TODAY,
        startDate: TODAY,
        endDate: "2026-11-30"
    });

    assert.equal(tasks[0].type, "feeding");
    assert.equal(tasks[1].type, "order");
});

test("the summary counts today, the coming week and overdue work", () => {
    const tasks = calendar.collectTasks({
        snakes: [snake({ lastFed: "2026-10-10" })],
        health: {
            getQuarantineStatus: () => ({ active: true, end: "2026-10-26", label: "passed" }),
            getHealthHistory: () => []
        },
        today: TODAY,
        startDate: TODAY,
        endDate: "2026-11-30"
    });
    const summary = calendar.summarizeTasks(tasks, TODAY);

    assert.equal(summary.today, 2);
    assert.equal(summary.overdue, 2);
    assert.equal(summary.byType.feeding, tasks.filter(task => task.type === "feeding").length);
});
