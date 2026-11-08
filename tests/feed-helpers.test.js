const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = { console };

context.window = context;
context.SnakeData = {
    isInactiveSnake: snake => ["Sold", "Archived", "Deceased"].includes(String(snake.status || "").trim())
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "feed-helpers.js"), "utf8"),
    context
);

const feeding = context.window;

// The helpers schedule from the real today, so the fixtures are relative to it.
function dateOffset(days) {
    const date = new Date();

    date.setDate(date.getDate() + days);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function snake(overrides = {}) {
    return {
        name: "Test snake",
        lastFed: dateOffset(-30),
        feedingIntervalDays: "14",
        ...overrides
    };
}

test("an overdue snake moves to its next scheduled feeding when snoozed", () => {
    const subject = snake();

    assert.equal(feeding.getFeedingStatus(subject).state, "due");
    assert.equal(feeding.isSnakeDueToFeed(subject), true);

    const snoozed = feeding.snoozeFeeding(subject);

    assert.equal(snoozed.daysUntil, 14);
    assert.equal(snoozed.dueDate, dateOffset(14));
    assert.equal(subject.feedingSnoozedOn, dateOffset(0));

    const status = feeding.getFeedingStatus(subject);

    assert.equal(status.state, "scheduled");
    assert.equal(status.daysUntil, 14);
    // The date it last ate is untouched: no meal was logged.
    assert.equal(status.daysSinceFed, 30);
    assert.equal(feeding.isSnakeDueToFeed(subject), false);
    assert.equal(feeding.isFeedSnoozed(subject), true);
    assert.equal(feeding.describeNextDue([subject]).includes("Next due"), true);
});

test("unsnoozing puts the snake back where the last meal left it", () => {
    const subject = snake();

    feeding.snoozeFeeding(subject);
    assert.equal(feeding.clearFeedingSnooze(subject), true);

    assert.equal(subject.feedingSnoozedOn, undefined);
    assert.equal(feeding.getFeedingStatus(subject).state, "due");
    assert.equal(feeding.clearFeedingSnooze(subject), false);
});

test("a snake due today snoozes into the next interval", () => {
    const subject = snake({ lastFed: dateOffset(-14) });

    assert.equal(feeding.getFeedingStatus(subject).state, "due");
    assert.equal(feeding.getFeedingStatus(subject).daysUntil, 0);
    assert.equal(feeding.snoozeFeeding(subject).daysUntil, 14);
    assert.equal(feeding.isSnakeDueToFeed(subject), false);
});

test("a snooze stops hiding the snake once its next slot has passed", () => {
    const subject = snake({ lastFed: dateOffset(-40), feedingSnoozedOn: dateOffset(-20) });

    assert.equal(feeding.getFeedingStatus(subject).daysUntil, -6);
    assert.equal(feeding.isSnakeDueToFeed(subject), true);
});

test("a snooze can schedule a snake that has never been fed", () => {
    const subject = snake({ lastFed: "" });

    assert.equal(feeding.getFeedingStatus(subject).state, "unscheduled");
    assert.equal(feeding.isSnakeDueToFeed(subject), false);

    const snoozed = feeding.snoozeFeeding(subject);

    assert.equal(snoozed.daysUntil, 14);
    assert.equal(feeding.getFeedingStatus(subject).state, "scheduled");
});

test("a snooze older than the last meal is ignored", () => {
    const subject = snake({ lastFed: dateOffset(-2), feedingSnoozedOn: dateOffset(-20) });
    const status = feeding.getFeedingStatus(subject);

    assert.equal(status.state, "scheduled");
    assert.equal(status.daysUntil, 12);
    assert.equal(status.snoozedOn, "");
    assert.equal(feeding.isFeedSnoozed(subject), false);
});

test("a snooze date must be a real date, and a bad one is dropped", () => {
    const subject = snake();

    feeding.snoozeFeeding(subject, "not-a-date");
    assert.equal(subject.feedingSnoozedOn, dateOffset(0));

    subject.feedingSnoozedOn = "14 Nov";
    assert.equal(feeding.getFeedingStatus(subject).state, "due");
    assert.equal(feeding.getFeedSnoozeDate(subject), "");
});

test("a resumed hold keeps priority over a snooze", () => {
    const subject = snake({ feedingHold: { reason: "Ovulation", since: dateOffset(-2) } });

    feeding.snoozeFeeding(subject);

    assert.equal(feeding.getFeedingStatus(subject).state, "hold");
    assert.equal(feeding.isSnakeDueToFeed(subject), false);
});
