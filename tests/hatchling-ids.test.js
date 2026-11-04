const test = require("node:test");
const assert = require("node:assert/strict");

const ids = require("../hatchling-id-helpers.js");

test("a clutch in 2026 numbers its hatchlings SS-C26-1-01 upward", () => {
    assert.equal(ids.baseFor("2026-01", "SS"), "SS-C26-1");
    assert.equal(ids.idFor("2026-01", "SS", 1), "SS-C26-1-01");
    assert.equal(ids.idFor("2026-01", "SS", 12), "SS-C26-1-12");
});

test("the second clutch of a year gets its own middle number", () => {
    assert.equal(ids.idFor("2026-02", "SS", 1), "SS-C26-2-01");
    assert.equal(ids.idFor("2026-10", "SS", 3), "SS-C26-10-03");
});

test("an old 2025 clutch produces the existing SS-C25-1 codes", () => {
    assert.equal(ids.baseFor("2025-01", "SS"), "SS-C25-1");
    assert.equal(ids.idFor("2025-01", "SS", 7), "SS-C25-1-07");
});

test("a custom prefix replaces SS but the clutch part stays readable", () => {
    assert.equal(ids.baseFor("2026-01", "soulless serpents"), "SOULLESS-C26-1");
    assert.equal(ids.baseFor("2026-01", ""), "SS-C26-1");
    assert.equal(ids.baseFor("Nova Clutch", "SS"), "SS-NOVA-CLUTCH");
});

test("the next number continues past the highest one on record", () => {
    const clutch = { id: "2026-01" };
    const snakes = [
        { clutchId: "2026-01", ID: "SS-C26-1-01" },
        { clutchId: "2026-01", ID: "SS-C26-1-04" },
        // Another clutch's hatchling must not push this one forward.
        { clutchId: "2026-02", ID: "SS-C26-2-09" }
    ];

    assert.equal(ids.nextNumber(clutch, "SS", snakes), 5);
    assert.equal(ids.nextNumber(clutch, "SS", []), 1);
});

test("old hatchlings carrying the clutch code are found for linking", () => {
    const snakes = [
        { name: "Old one", ID: "SS-C25-1-01" },
        { name: "Only in morph", morph: "SS-C25-1-02" },
        // Already part of a live clutch: leave it alone.
        { name: "Grouped", ID: "SS-C25-1-03", clutchId: "2025-02", clutchToken: "tc" },
        // A purchased animal keeps its SS-### code.
        { name: "Purchased", ID: "SS-038" },
        { name: "Other clutch", ID: "SS-C25-2-01" }
    ];

    assert.deepEqual(
        ids.unlinkedCandidates("2025-01", "SS", snakes, ["2025-01", "2025-02"])
            .map(snake => snake.name),
        ["Old one", "Only in morph"]
    );
});

test("a hatchling is picked up when its clutch link is missing or stale", () => {
    const snakes = [
        // Already stamped with the clutch but never token-linked.
        { name: "Half linked", ID: "SS-C25-1-01", clutchId: "2025-01" },
        // Points at a clutch that no longer exists after a restore.
        { name: "Dangling", ID: "SS-C25-1-02", clutchId: "gone-01" },
        { name: "Taken", ID: "SS-C25-1-03", clutchId: "other", clutchToken: "tc-x" }
    ];

    assert.deepEqual(
        ids.unlinkedCandidates("2025-01", "SS", snakes, ["2025-01"]).map(snake => snake.name),
        ["Half linked", "Dangling"]
    );
});

test("a code that only starts with the base but is not numbered is ignored", () => {
    assert.equal(ids.numberOf("SS-C25-1-ABC", "SS-C25-1"), null);
    assert.equal(ids.numberOf("SS-C25-10-01", "SS-C25-1"), null);
    assert.equal(ids.numberOf("SS-038", "SS-C25-1"), null);
});
