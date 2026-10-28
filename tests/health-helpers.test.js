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

const health = context.window.SnakeHealth;
const TODAY = "2026-10-27";

test("active, ending-soon and overdue quarantine states are distinct", () => {
    assert.equal(
        health.getQuarantineStatus({ quarantineStart: "2026-10-01", quarantineEnd: "2026-11-10" }, TODAY).state,
        "active"
    );
    assert.equal(
        health.getQuarantineStatus({ quarantineStart: "2026-10-01", quarantineEnd: "2026-10-27" }, TODAY).state,
        "due"
    );
    assert.equal(
        health.getQuarantineStatus({ quarantineStart: "2026-09-01", quarantineEnd: "2026-10-20" }, TODAY).state,
        "overdue"
    );
});

test("released quarantine is not active", () => {
    const status = health.getQuarantineStatus({
        quarantineStart: "2026-09-01",
        quarantineEnd: "2026-10-20",
        quarantineReleased: true,
        quarantineReleasedDate: "2026-10-21"
    }, TODAY);

    assert.equal(status.active, false);
    assert.equal(status.state, "released");
});

test("a due follow-up appears as a watch reason", () => {
    const reasons = health.getHealthWatchReasons({
        healthHistory: [
            { date: "2026-10-01", type: "Mites", severity: "Moderate", followUpDate: "2026-10-25" }
        ]
    }, TODAY);

    assert.ok(reasons.some(reason => reason.code === "follow-up"));
    assert.ok(reasons.some(reason => /overdue/i.test(reason.label)));
});

test("two refusals in 21 days produce a watch reason", () => {
    const reasons = health.getHealthWatchReasons({
        feedingHistory: [
            { date: "2026-10-10", result: "Refused" },
            { date: "2026-10-20", result: "Refused" },
            { date: "2026-09-01", result: "Refused" }
        ]
    }, TODAY);

    const refusal = reasons.find(reason => reason.code === "refusals");
    assert.ok(refusal);
    assert.match(refusal.label, /2 refusals/);
});

test("a meaningful weight drop produces a watch reason", () => {
    const reasons = health.getHealthWatchReasons({
        weightHistory: [
            { date: "2026-09-25", weight: 1000 },
            { date: "2026-10-20", weight: 900 }
        ]
    }, TODAY);

    const loss = reasons.find(reason => reason.code === "weight-loss");
    assert.ok(loss);
    assert.match(loss.label, /10\.0%/);
});

test("the watchlist puts urgent snakes first and the badge names quarantine", () => {
    const urgent = {
        name: "Urgent",
        quarantineStart: "2026-09-01",
        quarantineEnd: "2026-10-20"
    };
    const routine = {
        name: "Routine",
        weightHistory: [
            { date: "2026-09-25", weight: 1000 },
            { date: "2026-10-20", weight: 900 }
        ]
    };

    const items = health.getHealthWatchItems([routine, urgent], TODAY);

    assert.equal(items[0].snake.name, "Urgent");
    assert.equal(items.length, 2);
    assert.equal(health.getHealthBadge(urgent, TODAY).label, "Quarantine overdue");
    assert.equal(health.getHealthBadge(routine, TODAY).label, "Health watch");
});

test("a healthy snake has no badge", () => {
    assert.equal(health.getHealthBadge({ name: "Healthy" }, TODAY), null);
});
