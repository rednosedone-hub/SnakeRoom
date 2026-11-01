const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = { console };

context.window = context;
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "incubation-helpers.js"), "utf8"),
    context,
    { filename: "incubation-helpers.js" }
);

const incubation = context.window.Incubation;
const TODAY = "2026-10-28";

function clutch(overrides = {}) {
    return {
        id: "2026-01",
        laidDate: "2026-09-20",
        eggCount: 6,
        ...overrides
    };
}

test("a clutch is due 55 days after it was laid unless it says otherwise", () => {
    assert.equal(incubation.expectedHatchDate(clutch()), "2026-11-14");
    assert.equal(incubation.expectedHatchDate(clutch({ incubationDays: 50 })), "2026-11-09");
    // A number outside a real incubation is a typo, not a plan.
    assert.equal(incubation.expectedHatchDate(clutch({ incubationDays: 4 })), "2026-11-14");
    assert.equal(incubation.expectedHatchDate(clutch({ incubationDays: 400 })), "2026-11-14");
    assert.equal(incubation.expectedHatchDate({ eggCount: 4 }), "");
});

test("a clutch moves from incubating to due, overdue, pipped and hatched", () => {
    assert.equal(incubation.status(clutch({}), TODAY).stage, "incubating");
    assert.equal(incubation.status(clutch({}), "2026-11-14").stage, "due");
    assert.equal(incubation.status(clutch({}), "2026-11-17").stage, "overdue");
    assert.equal(incubation.status(clutch({ pipDate: "2026-11-12" }), "2026-11-13").stage, "pipped");
    assert.equal(incubation.status(clutch({ hatchedDate: "2026-11-15" }), TODAY).stage, "hatched");
    assert.equal(incubation.status(clutch({ convertedToSnakes: true }), TODAY).stage, "hatched");
    assert.equal(incubation.status({ eggCount: 6 }, TODAY).stage, "unlaid");
});

test("the status counts the days in and the days left", () => {
    const status = incubation.status(clutch(), TODAY);

    assert.equal(status.day, 38);
    assert.equal(status.dueDate, "2026-11-14");
    assert.equal(status.daysToHatch, 17);

    const late = incubation.status(clutch(), "2026-11-18");

    assert.equal(late.daysToHatch, -4);
});

test("candling keeps the date, counts and note, and drops empty rows", () => {
    const log = incubation.candleLog(clutch({
        candleLog: [
            { date: "2026-10-11", fertile: "6", slugs: "1", note: " good veins " },
            { date: "2026-10-11", fertile: "", slugs: "", note: "" },
            { date: "not a date", fertile: 3 },
            { date: "2026-10-04", fertile: 5 }
        ]
    }));

    assert.deepEqual(JSON.parse(JSON.stringify(log)), [
        { date: "2026-10-04", fertile: 5, slugs: "", note: "" },
        { date: "2026-10-11", fertile: 6, slugs: 1, note: "good veins" }
    ]);
});

test("the summary describes the latest candling, not the sum of all of them", () => {
    const summary = incubation.candlingSummary(clutch({
        candleLog: [
            { date: "2026-10-04", fertile: 8, slugs: 0 },
            { date: "2026-10-11", fertile: 6, slugs: 1 }
        ]
    }));

    assert.equal(summary.candled, 7);
    assert.equal(summary.fertile, 6);
    assert.equal(summary.slugs, 1);
    assert.equal(summary.date, "2026-10-11");
    assert.equal(summary.eggs, 6);
    assert.deepEqual(JSON.parse(JSON.stringify(incubation.candlingSummary(clutch()))), {
        eggs: 6,
        candled: null,
        fertile: null,
        slugs: null,
        date: ""
    });
});

test("candling is suggested three weeks after the eggs were laid", () => {
    assert.equal(incubation.candleDueDate(clutch()), "2026-10-11");
    assert.equal(incubation.latestCandle(clutch()), null);
    assert.ok(incubation.latestCandle(clutch({ candleLog: [{ date: "2026-10-11", fertile: 6 }] })));
});

test("hatch stats compare what hatched with what was laid", () => {
    assert.deepEqual(
        JSON.parse(JSON.stringify(incubation.hatchStats({ eggCount: 7, hatchlingCount: 6 }))),
        { eggs: 7, hatched: 6, percent: 86 }
    );
    assert.equal(incubation.hatchStats({ eggCount: 0, hatchlingCount: 0 }).percent, null);
    assert.equal(incubation.incubatedDays(clutch({ hatchedDate: "2026-11-16" })), 57);
    assert.equal(incubation.incubatedDays(clutch()), null);
});
