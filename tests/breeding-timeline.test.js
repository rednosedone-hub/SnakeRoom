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
    fs.readFileSync(path.join(projectRoot, "breeding-timeline.js"), "utf8"),
    context,
    { filename: "breeding-timeline.js" }
);

const timeline = context.window.BreedingTimeline;

function female(overrides = {}) {
    return {
        id: "female-1",
        name: "Nova",
        weightHistory: [],
        ...overrides
    };
}

test("a pre-lay shed places ovulation and eggs in the usual windows", () => {
    const estimate = timeline.estimate({ preLayShedDate: "2026-10-11" }, female());

    assert.equal(estimate.ovulationDate, "2026-09-23");
    assert.equal(estimate.ovulationFrom, "2026-09-17");
    assert.equal(estimate.ovulationTo, "2026-09-27");
    assert.equal(estimate.layDate, "2026-11-08");
    assert.equal(estimate.layFrom, "2026-11-01");
    assert.equal(estimate.layTo, "2026-11-15");
    assert.equal(estimate.ovulationObserved, false);
    assert.equal(estimate.confidence, "shed-only");
    assert.equal(estimate.weightClimb, null);
});

test("a recorded ovulation replaces the estimate but the shed still dates the eggs", () => {
    const estimate = timeline.estimate({
        preLayShedDate: "2026-10-11",
        ovulationObserved: true,
        ovulationDate: "2026-09-25"
    }, female());

    assert.equal(estimate.ovulationObserved, true);
    assert.equal(estimate.ovulationDate, "2026-09-25");
    assert.equal(estimate.layDate, "2026-11-08");
});

test("the climb before the shed is the supporting evidence", () => {
    const estimate = timeline.estimate({ preLayShedDate: "2026-10-11" }, female({
        weightHistory: [
            { date: "2026-08-20", weight: 1600 },
            { date: "2026-09-10", weight: 1680 },
            { date: "2026-10-01", weight: 1780 }
        ]
    }));

    assert.equal(estimate.confidence, "supported");
    assert.equal(estimate.weightClimb.gain, 180);
    assert.equal(estimate.weightClimb.days, 42);
    assert.equal(estimate.weightClimb.gramsPerWeek, 30);
    assert.equal(timeline.describeClimb(estimate.weightClimb), "+180g in 42 days (+30g/week)");
});

test("a flat card before the shed is not a climb", () => {
    const estimate = timeline.estimate({ preLayShedDate: "2026-10-11" }, female({
        weightHistory: [
            { date: "2026-08-20", weight: 1600 },
            { date: "2026-10-01", weight: 1608 }
        ]
    }));

    assert.equal(estimate.confidence, "shed-only");
    assert.equal(estimate.weightClimb, null);
});

test("weigh-ins outside the two months before the shed are ignored", () => {
    const estimate = timeline.estimate({ preLayShedDate: "2026-10-11" }, female({
        weightHistory: [
            { date: "2026-05-01", weight: 1500 },
            { date: "2026-06-01", weight: 1550 },
            { date: "2026-10-05", weight: 1790 }
        ]
    }));

    // Only one weigh-in falls inside the climb window, so there is no trend.
    assert.equal(estimate.weightClimb, null);
});

test("a missing or invalid shed has no estimate", () => {
    assert.equal(timeline.estimate({}, female()), null);
    assert.equal(timeline.estimate({ preLayShedDate: "not a date" }, female()), null);
    assert.equal(timeline.estimate({ preLayShedDate: "2026-02-30" }, female()), null);
});
