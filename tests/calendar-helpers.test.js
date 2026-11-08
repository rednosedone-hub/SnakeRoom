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
// The calendar shares the incubation maths with the outcomes page, so load it
// first: a clutch's own incubation length must move its hatch window.
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "incubation-helpers.js"), "utf8"),
    context,
    { filename: "incubation-helpers.js" }
);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "breeding-timeline.js"), "utf8"),
    context,
    { filename: "breeding-timeline.js" }
);
// Holds and their pickup dates come from sales-helpers.js, the same rules the
// dashboard and Finance page use.
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "sales-helpers.js"), "utf8"),
    context,
    { filename: "sales-helpers.js" }
);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "calendar-helpers.js"), "utf8"),
    context,
    { filename: "calendar-helpers.js" }
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
    const breeding = tasks.find(task => /Hatch window/.test(task.title));

    assert.equal(breeding.date, "2026-11-14");
    assert.match(breeding.title, /Hatch window opens/);
    assert.match(breeding.href, /breedingOutcomes\.html#clutch-2026-01/);
});

test("a clutch is asked to be candled once, around day 21", () => {
    const tasks = calendar.collectTasks({
        clutches: [
            { id: "2026-01", laidDate: "2026-09-20", eggCount: 6 },
            { id: "2026-02", laidDate: "2026-09-20", eggCount: 5, candleLog: [{ date: "2026-10-11", fertile: 5 }] }
        ],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-12-31"
    });
    const candleTasks = tasks.filter(task => /^Candle clutch/.test(task.title));

    assert.equal(candleTasks.length, 1);
    // Candling day has passed, so like every overdue job it lands on today.
    assert.equal(candleTasks[0].date, TODAY);
    assert.equal(candleTasks[0].overdue, true);
    assert.match(candleTasks[0].detail, /first look for veins/);
});

test("a clutch with its own incubation length moves its hatch window", () => {
    const tasks = calendar.collectTasks({
        clutches: [{ id: "2026-03", laidDate: "2026-09-20", eggCount: 6, incubationDays: 50, candleLog: [{ date: "2026-10-11", fertile: 6 }] }],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-12-31"
    });
    const breeding = tasks.find(task => /Hatch window/.test(task.title));

    assert.equal(breeding.date, "2026-11-09");
});

test("a clutch past its hatch window is not told to candle", () => {
    const tasks = calendar.collectTasks({
        clutches: [{ id: "2026-05", laidDate: "2026-03-01", eggCount: 7 }],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });

    assert.equal(tasks.filter(task => /^Candle clutch/.test(task.title)).length, 0);
    assert.equal(tasks.filter(task => /Hatch window passed/.test(task.title)).length, 1);
});

test("a hatched clutch leaves no candling or hatch reminders behind", () => {
    const tasks = calendar.collectTasks({
        clutches: [{ id: "2026-04", laidDate: "2026-09-20", eggCount: 6, convertedToSnakes: true }],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-12-31"
    });

    assert.equal(tasks.filter(task => task.type === "breeding").length, 0);
});

test("a pair's pre-lay shed puts ovulation and eggs on the calendar", () => {
    const tasks = calendar.collectTasks({
        snakes: [snake({
            id: "female-shed",
            name: "Nova",
            sex: "Female",
            weightHistory: [
                { date: "2026-08-20", weight: 1600 },
                { date: "2026-10-01", weight: 1780 }
            ]
        })],
        pairs: [{ id: "pair-shed", femaleSnakeId: "female-shed", preLayShedDate: "2026-10-11" }],
        today: TODAY,
        startDate: "2026-09-01",
        endDate: "2026-11-30"
    });
    const ovulation = tasks.find(task => task.title === "Ovulation (est.): Nova");
    const eggs = tasks.find(task => task.title === "Eggs due (est.): Nova");

    assert.equal(ovulation.date, "2026-09-23");
    assert.match(ovulation.detail, /Pre-lay shed 2026-10-11/);
    assert.match(ovulation.detail, /\+180g in 42 days/);

    assert.equal(eggs.date, "2026-11-08");
    assert.equal(eggs.overdue, false);
    assert.match(eggs.detail, /2026-11-01 to 2026-11-15/);
});

test("a recorded ovulation is not re-estimated, and laid eggs end the reminders", () => {
    const snakes = [snake({ id: "female-2", name: "Nova", sex: "Female" })];
    const recorded = calendar.collectTasks({
        snakes,
        pairs: [{
            femaleSnakeId: "female-2",
            preLayShedDate: "2026-10-11",
            ovulationObserved: true,
            ovulationDate: "2026-09-25"
        }],
        today: TODAY,
        startDate: "2026-09-01",
        endDate: "2026-11-30"
    });

    assert.equal(recorded.filter(task => /^Ovulation/.test(task.title)).length, 0);
    assert.equal(recorded.filter(task => /^Eggs due/.test(task.title)).length, 1);

    const laid = calendar.collectTasks({
        snakes,
        pairs: [
            { femaleSnakeId: "female-2", preLayShedDate: "2026-10-11", eggsLaidDate: "2026-11-05" },
            { femaleSnakeId: "female-2", preLayShedDate: "2026-10-11", clutchId: "2026-07" }
        ],
        today: TODAY,
        startDate: "2026-09-01",
        endDate: "2026-11-30"
    });

    assert.equal(laid.filter(task => /^Ovulation|^Eggs/.test(task.title)).length, 0);
});

test("an overdue lay estimate is pinned to today, then fades out", () => {
    const snakes = [snake({ id: "female-late", name: "Late", sex: "Female" })];
    const recent = calendar.collectTasks({
        snakes,
        pairs: [{ femaleSnakeId: "female-late", preLayShedDate: "2026-09-20" }],
        today: TODAY,
        startDate: "2026-09-01",
        endDate: "2026-11-30"
    });
    const late = recent.find(task => task.title === "Eggs overdue (est.): Late");

    assert.equal(late.date, TODAY);
    assert.equal(late.overdue, true);

    // Two weeks past the end of the lay window it is history, not a job.
    const stale = calendar.collectTasks({
        snakes,
        pairs: [{ femaleSnakeId: "female-late", preLayShedDate: "2026-06-01" }],
        today: TODAY,
        startDate: "2026-08-01",
        endDate: "2026-10-31"
    });

    assert.equal(stale.filter(task => /Ovulation \(est\.\)|Eggs (due|overdue) \(est\.\)/.test(task.title)).length, 0);
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

test("a dated hold puts its pickup and a three-day reminder on the calendar", () => {
    const tasks = calendar.collectTasks({
        snakes: [snake({
            status: "On Hold",
            holdBuyer: "Alex Chen",
            holdDueDate: "2026-11-10",
            holdPrice: "400",
            holdDeposit: "100"
        })],
        buyers: [{ id: "buyer-1", name: "Alex Chen", phone: "555-0101", email: "alex@example.com" }],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });
    const pickups = tasks.filter(task => task.type === "pickup");

    assert.equal(pickups.length, 2);

    // Three days out is the reminder to reach out and make the final
    // arrangements, and it carries the phone number and the balance.
    assert.equal(pickups[0].date, "2026-11-07");
    assert.match(pickups[0].title, /Confirm pickup: Nova/);
    assert.match(pickups[0].detail, /Pickup in 13 days \(2026-11-10\)/);
    assert.match(pickups[0].detail, /for Alex Chen/);
    assert.match(pickups[0].detail, /555-0101/);
    assert.match(pickups[0].detail, /\$300 balance due/);
    assert.equal(pickups[0].href, "snake-form.html?uid=snake-1");

    assert.equal(pickups[1].date, "2026-11-10");
    assert.match(pickups[1].title, /^Pickup: Nova/);
    assert.equal(pickups[1].overdue, false);
});

test("inside the reminder window the reminder lands on today", () => {
    const tasks = calendar.collectTasks({
        snakes: [snake({ status: "On Hold", holdBuyer: "Sam", holdDueDate: "2026-10-30" })],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });
    const pickups = tasks.filter(task => task.type === "pickup");

    assert.equal(pickups.length, 2);
    assert.equal(pickups[0].date, TODAY);
    assert.match(pickups[0].title, /Confirm pickup/);
    assert.match(pickups[0].detail, /Pickup in 2 days \(2026-10-30\)/);
    assert.equal(pickups[1].date, "2026-10-30");
});

test("an e-mail is used when no phone is on file", () => {
    const tasks = calendar.collectTasks({
        snakes: [snake({ status: "On Hold", holdBuyer: "Sam Lee", holdDueDate: "2026-11-10" })],
        buyers: [{ id: "buyer-2", name: "sam lee", phone: "", email: "sam@example.com" }],
        today: TODAY,
        startDate: "2026-11-01",
        endDate: "2026-11-30"
    });

    assert.match(tasks.find(task => task.type === "pickup").detail, /sam@example\.com/);
});

test("a passed pickup is one overdue task on today's list", () => {
    const tasks = calendar.collectTasks({
        snakes: [snake({ status: "On Hold", holdBuyer: "Alex", holdDueDate: "2026-10-25" })],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });
    const pickups = tasks.filter(task => task.type === "pickup");

    assert.equal(pickups.length, 1);
    assert.equal(pickups[0].date, TODAY);
    assert.equal(pickups[0].overdue, true);
    assert.match(pickups[0].title, /Pickup was due: Nova/);
    assert.match(pickups[0].detail, /3 days late/);
});

test("a hold without a pickup date, or a sold snake, adds no pickup tasks", () => {
    const tasks = calendar.collectTasks({
        snakes: [
            snake({ id: "snake-1", status: "On Hold", holdBuyer: "Alex", holdDueDate: "" }),
            snake({ id: "snake-2", name: "Sold one", status: "Sold", holdBuyer: "Alex", holdDueDate: "2026-11-10" })
        ],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });

    assert.equal(tasks.filter(task => task.type === "pickup").length, 0);
});

test("a snoozed feeding is not chased today, and the next meal follows its slot", () => {
    const tasks = calendar.collectTasks({
        snakes: [snake({ lastFed: "2026-10-10", feedingSnoozedOn: TODAY })],
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30"
    });
    const feedings = tasks.filter(task => task.type === "feeding");

    assert.equal(feedings.some(task => task.overdue), false);
    assert.equal(feedings[0].date, "2026-11-04");
});
