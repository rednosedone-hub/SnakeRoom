const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = { console };
context.window = context;

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(projectRoot, "health-helpers.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(projectRoot, "readiness.js"), "utf8"), context);

const readiness = context.window.SnakeReadiness;
const TODAY = "2026-10-27";

function snake(overrides = {}) {
    return {
        name: "Test snake",
        sex: "Female",
        weight: 1600,
        hatchDate: "2022-06-01",
        status: "Breeder",
        ...overrides
    };
}

function blockerCodes(result) {
    return result.blockers.map(item => item.code);
}

test("a mature female at the minimum weight and age is ready", () => {
    const result = readiness.getPairingReadiness(snake(), TODAY);

    assert.equal(result.ready, true);
    assert.equal(result.state, "ready");
    assert.equal(result.summary, "Ready to pair");
    assert.equal(result.blockers.length, 0);
});

test("imported lower-case sex values still use the right rules", () => {
    const result = readiness.getPairingReadiness(snake({ sex: "female" }), TODAY);

    assert.equal(result.sex, "Female");
    assert.equal(result.ready, true);
});

test("a mature male has a lower weight and age minimum", () => {
    const result = readiness.getPairingReadiness(snake({
        sex: "Male",
        weight: 700,
        hatchDate: "2024-06-01"
    }), TODAY);

    assert.equal(result.ready, true);
    assert.equal(result.rules.minWeight, 700);
    assert.equal(result.rules.minAgeDays, 548);
});

test("a young underweight female reports both blockers", () => {
    const result = readiness.getPairingReadiness(snake({
        weight: 1200,
        hatchDate: "2025-10-01"
    }), TODAY);

    assert.equal(result.ready, false);
    assert.ok(blockerCodes(result).includes("age"));
    assert.ok(blockerCodes(result).includes("weight"));
    assert.match(result.summary, /Too young/);
    assert.match(result.summary, /Underweight/);
});

test("a missing hatch date is a warning, while missing weight still blocks", () => {
    const result = readiness.getPairingReadiness(snake({
        status: "Juvenile",
        hatchDate: "",
        weight: 0
    }), TODAY);

    assert.equal(result.ready, false);
    assert.equal(blockerCodes(result).includes("age"), false);
    assert.ok(result.warnings.some(item => item.code === "age"));
    assert.ok(result.warnings.some(item => item.code === "status"));
    assert.equal(result.blockers.find(item => item.code === "weight").label, "Weight missing");
});

test("a missing hatch date is a warning, not a block", () => {
    const result = readiness.getPairingReadiness(snake({
        hatchDate: "",
        status: "Breeder"
    }), TODAY);

    assert.equal(result.ready, true);
    assert.equal(result.warnings.map(item => item.code).join(","), "age");
    assert.match(result.warnings[0].detail, /hatch date or hatch year/);
});

test("a hatch year gives a conservative age estimate", () => {
    const result = readiness.getPairingReadiness(snake({
        hatchDate: "",
        hatchYear: "2022"
    }), TODAY);

    assert.equal(result.ready, true);
    assert.equal(result.ageSource, "year");
    assert.equal(result.ageDays, null);
    assert.equal(result.hatchYear, 2022);
    assert.ok(result.checks.some(item => item.code === "age" && item.state === "pass"));
    assert.match(
        result.checks.find(item => item.code === "age").label,
        /Age ~3\.8 yr \(2022\)/
    );
});

test("a year estimate near the age minimum is a warning, not a block", () => {
    const result = readiness.getPairingReadiness(snake({
        hatchDate: "",
        hatchYear: "2023"
    }), TODAY);

    assert.equal(result.ready, true);
    assert.equal(blockerCodes(result).includes("age"), false);
    assert.ok(result.warnings.some(item => item.code === "age"));
    assert.match(
        result.warnings.find(item => item.code === "age").label,
        /Age estimate near minimum/
    );
});

test("a hatch year that is definitely too young blocks readiness", () => {
    const result = readiness.getPairingReadiness(snake({
        hatchDate: "",
        hatchYear: "2024"
    }), TODAY);

    assert.equal(result.ready, false);
    assert.equal(
        result.blockers.find(item => item.code === "age").label,
        "Too young (hatch year 2024)"
    );
});

test("an exact hatch date wins over an estimated hatch year", () => {
    const result = readiness.getPairingReadiness(snake({
        hatchDate: "2022-06-01",
        hatchYear: "2026"
    }), TODAY);

    assert.equal(result.ready, true);
    assert.equal(result.ageSource, "date");
    assert.equal(result.hatchYear, 2026);
});

test("a future hatch year is invalid", () => {
    const result = readiness.getPairingReadiness(snake({
        hatchDate: "",
        hatchYear: "2028"
    }), TODAY);

    assert.equal(result.ready, false);
    assert.equal(
        result.blockers.find(item => item.code === "age").label,
        "Hatch year is in the future"
    );
});

test("an immature status is a warning when age is unknown, so the record can be found and fixed", () => {
    const result = readiness.getPairingReadiness(snake({
        hatchDate: "",
        status: "Sub-Adult"
    }), TODAY);

    assert.equal(result.ready, true);
    assert.equal(
        result.warnings.map(item => item.code).sort().join(","),
        "age,status"
    );
    assert.equal(
        result.warnings.find(item => item.code === "status").label,
        "Status says Sub-Adult"
    );
});

test("a stale status on an otherwise mature snake is flagged for update", () => {
    const result = readiness.getPairingReadiness(snake({
        hatchDate: "2022-06-01",
        status: "Holdback"
    }), TODAY);

    assert.equal(result.ready, true);
    assert.equal(result.warnings.map(item => item.code).join(","), "status");
    assert.match(result.warnings[0].label, /Holdback/);
});

test("unknown sex is a blocker even when age and weight are present", () => {
    const result = readiness.getPairingReadiness(snake({ sex: "Unknown" }), TODAY);

    assert.equal(result.ready, false);
    assert.ok(blockerCodes(result).includes("sex"));
    assert.equal(result.rules, null);
});

test("a sold snake is not ready even with mature age and weight", () => {
    const result = readiness.getPairingReadiness(snake({ status: "Sold" }), TODAY);

    assert.equal(result.ready, false);
    assert.ok(blockerCodes(result).includes("active"));
});

test("active quarantine blocks readiness", () => {
    const result = readiness.getPairingReadiness(snake({
        quarantineStart: "2026-10-01",
        quarantineEnd: "2026-11-10"
    }), TODAY);

    assert.equal(result.ready, false);
    assert.ok(blockerCodes(result).includes("quarantine"));
});

test("an unresolved severe health event blocks readiness", () => {
    const result = readiness.getPairingReadiness(snake({
        healthHistory: [
            { date: "2026-10-01", type: "Illness", severity: "Severe" }
        ]
    }), TODAY);

    assert.equal(result.ready, false);
    assert.ok(blockerCodes(result).includes("severe"));

    const resolved = readiness.getPairingReadiness(snake({
        healthHistory: [
            {
                date: "2026-09-01",
                type: "Illness",
                severity: "Severe",
                resolvedDate: "2026-09-20"
            }
        ]
    }), TODAY);

    assert.equal(resolved.ready, true);
});

test("a regurgitation in the last 14 days blocks readiness", () => {
    const recent = readiness.getPairingReadiness(snake({
        feedingHistory: [{ date: "2026-10-20", result: "Regurgitated" }]
    }), TODAY);

    assert.equal(recent.ready, false);
    assert.ok(blockerCodes(recent).includes("regurgitation"));

    const older = readiness.getPairingReadiness(snake({
        feedingHistory: [{ date: "2026-10-01", result: "Regurgitated" }]
    }), TODAY);

    assert.equal(older.ready, true);
});

test("weight loss and refusals are warnings, not blockers", () => {
    const result = readiness.getPairingReadiness(snake({
        weightHistory: [
            { date: "2026-09-25", weight: 1800 },
            { date: "2026-10-20", weight: 1600 }
        ],
        feedingHistory: [
            { date: "2026-10-10", result: "Refused" },
            { date: "2026-10-20", result: "Refused" }
        ]
    }), TODAY);

    assert.equal(result.ready, true);
    assert.equal(
        result.warnings.map(item => item.code).sort().join(","),
        "refusals,weight-loss"
    );
});

test("a female is blocked for six months after her latest lay", () => {
    const female = snake({
        id: "female-1",
        hatchDate: "2022-06-01"
    });
    const result = readiness.getPairingReadiness(female, {
        today: TODAY,
        clutches: [
            { femaleSnakeId: "female-1", laidDate: "2026-04-01" },
            { femaleSnakeId: "female-1", laidDate: "2026-06-15" }
        ]
    });

    assert.equal(result.ready, false);
    assert.ok(blockerCodes(result).includes("post-lay-hold"));
    assert.equal(result.postLay.lastLayDate, "2026-06-15");
    assert.equal(result.postLay.holdUntil, "2026-12-15");
});

test("a pair's eggs-laid date also starts the post-lay hold", () => {
    const female = snake({ id: "female-2", hatchDate: "2022-06-01" });
    const result = readiness.getPairingReadiness(female, {
        today: TODAY,
        breedingPairs: [
            { femaleSnakeId: "female-2", eggsLaidDate: "2026-06-20" }
        ]
    });

    assert.equal(result.ready, false);
    assert.ok(blockerCodes(result).includes("post-lay-hold"));
    assert.equal(result.postLay.holdUntil, "2026-12-20");
});

test("the post-lay hold ends after six months", () => {
    const female = snake({ id: "female-3", hatchDate: "2022-06-01" });
    const result = readiness.getPairingReadiness(female, {
        today: TODAY,
        clutches: [{ femaleSnakeId: "female-3", laidDate: "2026-04-01" }]
    });

    assert.equal(result.ready, true);
    assert.equal(result.postLay.holdUntil, "2026-10-01");
    assert.equal(result.postLay.active, false);
});

test("the post-lay hold ignores male records and supports legacy female indexes", () => {
    const female = snake({ id: "female-4", hatchDate: "2022-06-01" });
    const male = snake({ id: "male-4", sex: "Male", hatchDate: "2023-06-01" });
    const pool = [female, male];
    const maleResult = readiness.getPairingReadiness(male, {
        today: TODAY,
        snakes: pool,
        clutches: [{ femaleSnakeId: "female-4", laidDate: "2026-06-15" }]
    });
    const legacyResult = readiness.getPairingReadiness(female, {
        today: TODAY,
        snakes: pool,
        clutches: [{ femaleIndex: 0, laidDate: "2026-06-15" }]
    });

    assert.equal(maleResult.ready, true);
    assert.equal(maleResult.postLay, null);
    assert.equal(legacyResult.ready, false);
    assert.ok(blockerCodes(legacyResult).includes("post-lay-hold"));
});

test("month-end lay dates clamp to the last day of the hold month", () => {
    assert.equal(readiness.addMonths("2026-08-31", 6), "2027-02-28");
    assert.equal(readiness.addMonths("2026-10-15", 6), "2027-04-15");
});

test("the badge only shows not-ready when asked and explains blockers", () => {
    const healthyBadge = readiness.getReadinessBadge(snake(), { today: TODAY });
    assert.equal(healthyBadge.label, "Ready to pair");

    const missing = snake({ weight: 0 });
    assert.equal(readiness.getReadinessBadge(missing, { today: TODAY }), null);

    const notReadyBadge = readiness.getReadinessBadge(missing, {
        today: TODAY,
        showNotReady: true
    });

    assert.equal(notReadyBadge.label, "Not ready");
    assert.match(notReadyBadge.title, /Weight missing/);
});
