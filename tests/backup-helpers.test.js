const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { projectRoot } = require("./helpers/load-app");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "backup-helpers.js"), "utf8"),
    context,
    { filename: "backup-helpers.js" }
);

const history = context.window.BackupHistory;

function row(id, createdAt, reason = "auto") {
    return { id, created_at: createdAt, reason };
}

test("a version is described by what it holds", () => {
    const summary = history.summarizeSnapshot({
        app: "the-snake-room",
        data: {
            snakes: [{}, {}, {}],
            breedingPairs: [{}],
            clutches: [],
            financeExpenses: [{}]
        }
    });

    assert.deepEqual(
        { ...summary, savedAt: undefined },
        { snakes: 3, pairs: 1, clutches: 0, expenses: 1, savedAt: undefined }
    );
    assert.equal(history.describeSummary(summary), "3 snakes \u00b7 1 pair \u00b7 0 clutches");
    assert.equal(history.describeSummary(null), "Not a readable backup");
    assert.equal(history.summarizeSnapshot(null), null);
    assert.equal(history.summarizeSnapshot({ data: [] }), null);
});

test("only the newest automatic version inside the window survives a push", () => {
    const now = Date.parse("2026-10-30T12:00:00Z");
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toISOString();

    assert.equal(
        history.shouldArchiveAuto({ newest: row("a", tenMinutesAgo), now }),
        false
    );
    assert.equal(
        history.shouldArchiveAuto({ newest: row("a", twentyMinutesAgo), now }),
        true
    );
    // Nothing archived yet, or a row without a date: go ahead.
    assert.equal(history.shouldArchiveAuto({ now }), true);
    assert.equal(history.shouldArchiveAuto({ newest: { id: "a" }, now }), true);
});

test("retention drops the oldest versions and keeps the newest", () => {
    const rows = [
        row("oldest", "2026-10-01T00:00:00Z"),
        row("middle", "2026-10-02T00:00:00Z"),
        row("newest", "2026-10-03T00:00:00Z"),
        row("undated", "")
    ];

    // Newest two survive: only the oldest is dropped. The undated row is not
    // counted at all, so it can never displace a real version.
    assert.equal(history.historyIdsToDrop(rows, 2).join(","), "oldest");
    assert.equal(history.historyIdsToDrop(rows, 1).join(","), "middle,oldest");
    assert.equal(history.historyIdsToDrop(rows, 10).length, 0);
});

test("versions are listed newest first and reason reads like English", () => {
    const sorted = history.sortNewestFirst([
        row("old", "2026-10-01T00:00:00Z"),
        row("new", "2026-10-09T00:00:00Z"),
        row("broken", "")
    ]);

    assert.deepEqual(Array.from(sorted, item => item.id), ["new", "old"]);
    assert.equal(history.describeReason("auto"), "Saved automatically");
    assert.equal(history.describeReason("manual"), "Checkpoint you saved");
    assert.equal(history.describeReason("before restore"), "Before a restore");
    assert.equal(history.describeReason(""), "Saved version");
    assert.equal(history.describeReason("something new"), "Saved version");
});

test("the count line never claims more than the limit", () => {
    assert.equal(history.historyCountLabel(0), "No saved versions yet.");
    assert.equal(history.historyCountLabel(3, 40), "3 of 40 versions kept");
});
