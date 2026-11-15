const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const storage = new Map();
const context = { console };

context.window = context;
// The calendar keeps the keeper's own jobs in localStorage, the same place the
// rest of the collection lives.
context.localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
};
context.SnakeData = {
    isInactiveSnake: snake => ["Sold", "Archived", "Deceased"].includes(String(snake.status || ""))
};

vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "calendar-helpers.js"), "utf8"),
    context,
    { filename: "calendar-helpers.js" }
);

const calendar = context.window.CalendarTools;
const TODAY = "2026-10-28";

function reset() {
    storage.clear();
}

function collect(options) {
    return calendar.collectTasks({
        today: TODAY,
        startDate: "2026-10-01",
        endDate: "2026-11-30",
        ...options
    });
}

test("an event the keeper writes lands on its own day", () => {
    reset();
    const added = calendar.addEvent({ title: "Clean the tubs", date: "2026-10-30" });

    assert.equal(added.error, "");
    assert.equal(added.events.length, 1);

    const events = collect({ events: calendar.readEvents() }).filter(task => task.type === "event");

    assert.equal(events.length, 1);
    assert.equal(events[0].date, "2026-10-30");
    assert.equal(events[0].title, "Clean the tubs");
    assert.equal(events[0].overdue, undefined);
    assert.equal(events[0].eventId, added.event.id);
});

test("a past event stays on the day it was written for", () => {
    reset();
    calendar.addEvent({ title: "Weigh everyone", date: "2026-10-05" });

    const events = collect({ events: calendar.readEvents() }).filter(task => task.type === "event");

    // Derived jobs are pinned to today when they are late; a written job is kept
    // where it belongs so the month shows what was actually missed.
    assert.equal(events[0].date, "2026-10-05");
    assert.notEqual(events[0].date, TODAY);
    assert.equal(events[0].overdue, undefined);
});

test("events outside the asked-for window are left out", () => {
    reset();
    calendar.addEvent({ title: "Clean the tubs", date: "2026-09-20" });
    calendar.addEvent({ title: "Water change", date: "2026-10-29" });

    const events = collect({ events: calendar.readEvents() }).filter(task => task.type === "event");

    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Water change");
});

test("an event with no name or no date is refused and nothing is stored", () => {
    reset();
    const noName = calendar.addEvent({ title: "   ", date: "2026-10-30" });
    const noDate = calendar.addEvent({ title: "Cleaning", date: "" });
    const badDate = calendar.addEvent({ title: "Cleaning", date: "2026-02-31" });

    assert.match(noName.error, /name and a date/);
    assert.match(noDate.error, /name and a date/);
    assert.match(badDate.error, /name and a date/);
    assert.equal(calendar.readEvents().length, 0);
});

test("junk saved into storage is normalised rather than shown", () => {
    reset();
    context.localStorage.setItem("calendarEvents", JSON.stringify([
        { id: "keep-me", title: "  Cleaning  ", date: "2026-10-30T00:00:00" },
        { title: "No date", date: "" },
        null,
        "not an event"
    ]));

    const events = calendar.readEvents();

    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Cleaning");
    assert.equal(events[0].date, "2026-10-30");
});

test("removing an event leaves the rest of the list alone", () => {
    reset();
    const first = calendar.addEvent({ title: "Clean the tubs", date: "2026-10-30" });
    calendar.addEvent({ title: "Weigh the hatchlings", date: "2026-10-31" });

    const remaining = calendar.removeEvent(first.event.id);

    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].title, "Weigh the hatchlings");

    const afterReload = calendar.readEvents();

    assert.equal(afterReload.length, 1);
    assert.equal(afterReload[0].title, "Weigh the hatchlings");
});

test("events sort alongside the app's own jobs by date", () => {
    reset();
    calendar.addEvent({ title: "Clean the tubs", date: "2026-10-29" });

    const tasks = collect({
        snakes: [{
            id: "snake-1",
            name: "Nova",
            status: "Breeder",
            feederSize: "Small Rat",
            lastFed: "2026-10-21",
            feedingIntervalDays: "7"
        }],
        events: calendar.readEvents()
    });
    // Copied out of the vm's own realm so the arrays compare by value.
    const days = [...tasks.map(task => task.date)];

    assert.deepEqual([...days].sort(), days);
    assert.ok(tasks.some(task => task.type === "feeding"));
    assert.ok(tasks.some(task => task.type === "event" && task.title === "Clean the tubs"));
});
