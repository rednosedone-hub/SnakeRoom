const test = require("node:test");
const assert = require("node:assert/strict");

const scan = require("../scan-helpers.js");

function snake(overrides = {}) {
    return {
        id: "snake-1",
        name: "Nova",
        ID: "SS-C26-1-01",
        morph: "Pastel",
        sex: "Female",
        feederSize: "Small Rat",
        lastFed: "2026-10-01",
        feedingHistory: [],
        weightHistory: [],
        ...overrides
    };
}

test("a bin-card QR resolves to the uid it carries", () => {
    assert.equal(
        scan.parseScanPayload("http://localhost:8098/snake-form.html?uid=snake-1"),
        "snake-1"
    );
    assert.equal(
        scan.parseScanPayload("https://example.com/snake-form.html?uid=snake%2D1&x=1"),
        "snake-1"
    );
});

test("a typed code is used as it is", () => {
    assert.equal(scan.parseScanPayload(" SS-C26-1-01 "), "SS-C26-1-01");
    assert.equal(scan.parseScanPayload(""), "");
});

test("a scan finds the animal by id, keeper ID or name", () => {
    const snakes = [snake(), snake({ id: "snake-2", name: "Atlas", ID: "SS-004", morph: "Clown" })];

    assert.equal(scan.findSnake(snakes, "snake-2").name, "Atlas");
    assert.equal(scan.findSnake(snakes, "SS-C26-1-01").name, "Nova");
    assert.equal(scan.findSnake(snakes, "atlas").name, "Atlas");
    assert.equal(
        scan.findSnake(snakes, "http://localhost/snake-form.html?uid=snake-1").name,
        "Nova"
    );
    assert.equal(scan.findSnake(snakes, "SS-999"), null);
    assert.equal(scan.findSnake(snakes, ""), null);
});

test("the internal id wins over a morph another animal also carries", () => {
    const snakes = [
        snake({ id: "snake-1", name: "Nova", morph: "Pastel" }),
        snake({ id: "snake-9", name: "Copy", ID: "SS-9", morph: "snake-1" })
    ];

    assert.equal(scan.findSnake(snakes, "snake-1").name, "Nova");
});

test("an accepted feed sets lastFed, keeps the feeder and uses stock", () => {
    const animal = snake();
    const result = scan.applyFeeding(animal, {
        date: "2026-11-05",
        feederSize: "Weaned Rat",
        result: "Accepted"
    });

    assert.equal(result.ok, true);
    assert.equal(animal.lastFed, "2026-11-05");
    assert.equal(animal.feederSize, "Weaned Rat");
    assert.equal(animal.feedingHistory.length, 1);
    assert.deepEqual(animal.feedingHistory[0], {
        date: "2026-11-05",
        feederSize: "Weaned Rat",
        result: "Accepted"
    });
    assert.deepEqual(result.stock, { size: "Weaned Rat", quantity: 1 });
});

test("a refusal is logged, leaves lastFed alone and takes no stock", () => {
    const animal = snake();
    const result = scan.applyFeeding(animal, {
        date: "2026-11-05",
        feederSize: "Small Rat",
        result: "Refused",
        reason: "In shed"
    });

    assert.equal(result.ok, true);
    assert.equal(animal.lastFed, "2026-10-01");
    assert.equal(result.stock, null);
    assert.equal(animal.feedingHistory[0].result, "Refused");
    assert.equal(animal.feedingHistory[0].reason, "In shed");
});

test("an ovulation refusal puts the animal on a feeding hold", () => {
    const animal = snake();
    const result = scan.applyFeeding(animal, {
        date: "2026-11-05",
        feederSize: "Small Rat",
        result: "Refused",
        reason: "Ovulation"
    });

    assert.deepEqual(animal.feedingHold, { reason: "Ovulation", since: "2026-11-05" });
    assert.equal(result.previousHold, null);
    assert.equal(animal.lastFed, "2026-10-01");
});

test("any other refusal leaves the feeding schedule alone", () => {
    const animal = snake();

    scan.applyFeeding(animal, {
        date: "2026-11-05",
        feederSize: "Small Rat",
        result: "Refused",
        reason: "In shed"
    });

    assert.equal(animal.feedingHold, undefined);
});

test("a hold that was already there is reported for undo", () => {
    const hold = { reason: "Ovulation", since: "2026-10-01" };
    const animal = snake({ feedingHold: hold });
    const result = scan.applyFeeding(animal, {
        date: "2026-11-05",
        feederSize: "Small Rat",
        result: "Accepted"
    });

    assert.equal(result.previousHold, hold);
});

test("a feed without a date is rejected instead of guessing today", () => {
    const animal = snake();
    const result = scan.applyFeeding(animal, { date: "", result: "Accepted" });

    assert.equal(result.ok, false);
    assert.equal(animal.feedingHistory.length, 0);
});

test("a weight is written to the history and the current weight", () => {
    const animal = snake();
    const result = scan.applyWeight(animal, { date: "2026-11-05", weight: "1820" });

    assert.equal(result.ok, true);
    assert.equal(animal.weight, "1820");
    assert.deepEqual(animal.weightHistory[0], { date: "2026-11-05", weight: 1820 });
});

test("an empty or silly weight is rejected", () => {
    const animal = snake();

    assert.equal(scan.applyWeight(animal, { date: "2026-11-05", weight: "" }).ok, false);
    assert.equal(scan.applyWeight(animal, { date: "2026-11-05", weight: "0" }).ok, false);
    assert.equal(scan.applyWeight(animal, { date: "2026-11-05", weight: "99999" }).ok, false);
    assert.equal(scan.applyWeight(animal, { date: "", weight: "1800" }).ok, false);
    assert.equal(animal.weightHistory.length, 0);
});

test("a second weigh-in on the same day is the current weight", () => {
    const animal = snake({
        weight: "1030",
        weightHistory: [
            { date: "2026-11-05", weight: 1020 },
            { date: "2026-11-05", weight: 1030 }
        ]
    });

    assert.deepEqual(scan.latestWeight(animal), { date: "2026-11-05", weight: 1030 });
});

test("the latest weight comes from the newest dated entry", () => {
    const animal = snake({
        weight: "1700",
        weightHistory: [
            { date: "2026-09-01", weight: 1600 },
            { date: "2026-10-01", weight: "1745" }
        ]
    });

    assert.deepEqual(scan.latestWeight(animal), { date: "2026-10-01", weight: 1745 });
    assert.deepEqual(scan.latestWeight(snake({ weight: "1200" })), { date: "", weight: 1200 });
    assert.equal(scan.latestWeight(snake()), null);
});
