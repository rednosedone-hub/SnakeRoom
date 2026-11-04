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

test("a printable card runs from the shed through the egg window to hatch", () => {
    const card = timeline.card({ preLayShedDate: "2026-10-11" }, female());

    assert.equal(card.stages.map(stage => stage.key).join(","), "shed,ovulation,eggs,hatch");
    assert.equal(card.stages[1].label, "Ovulation (est.)");
    assert.equal(card.stages[1].date, "2026-09-23");
    assert.equal(card.stages[1].from, "2026-09-17");
    assert.equal(card.stages[1].to, "2026-09-27");
    assert.equal(card.stages[2].label, "Eggs due (est.)");
    assert.equal(card.stages[2].date, "2026-11-08");
    assert.equal(card.stages[2].from, "2026-11-01");
    assert.equal(card.stages[2].to, "2026-11-15");
    assert.equal(card.stages[2].observed, false);
    assert.equal(card.hatchDate, "2027-01-02");
    assert.equal(card.stages[3].date, "2027-01-02");
    assert.equal(card.stages[3].note, "55 days in the incubator");
});

test("a clutch on record prints the real lay date and its own incubation", () => {
    const card = timeline.card({ laidDate: "2026-10-01", eggCount: 7, incubationDays: 60 }, female());

    assert.equal(card.stages.length, 2);
    assert.equal(card.stages[0].label, "Eggs laid");
    assert.equal(card.stages[0].date, "2026-10-01");
    assert.equal(card.stages[0].observed, true);
    assert.equal(card.hatchDate, "2026-11-30");
    assert.equal(card.eggCount, 7);
});

test("a laid clutch drops the estimated egg window", () => {
    const card = timeline.card({ preLayShedDate: "2026-10-11", laidDate: "2026-11-10" }, female());
    const eggs = card.stages.find(stage => stage.key === "eggs");

    assert.equal(eggs.date, "2026-11-10");
    assert.equal(eggs.from, "");
    assert.equal(eggs.to, "");
    assert.equal(eggs.observed, true);
});

test("a hatched clutch keeps its real hatch date and recorded ovulation", () => {
    const card = timeline.card({
        preLayShedDate: "2026-09-01",
        ovulationObserved: true,
        ovulationDate: "2026-08-14",
        laidDate: "2026-09-28",
        hatchedDate: "2026-11-22"
    }, female());
    const ovulation = card.stages.find(stage => stage.key === "ovulation");
    const hatch = card.stages.find(stage => stage.key === "hatch");

    assert.equal(ovulation.label, "Ovulation");
    assert.equal(ovulation.observed, true);
    // A recorded ovulation has no estimated window to show.
    assert.equal(ovulation.from, "");
    assert.equal(ovulation.to, "");
    assert.equal(hatch.label, "Hatched");
    assert.equal(hatch.observed, true);
    assert.equal(card.hatchDate, "2026-11-22");
    assert.equal(card.hatchedDate, "2026-11-22");
});

test("a card needs a real date, and a silly incubation falls back to 55 days", () => {
    assert.equal(timeline.card({}, female()), null);
    assert.equal(timeline.card({ laidDate: "nonsense" }, female()), null);
    assert.equal(timeline.incubationDays(500), 55);
    assert.equal(timeline.incubationDays(""), 55);
    assert.equal(timeline.incubationDays(60), 60);
});
