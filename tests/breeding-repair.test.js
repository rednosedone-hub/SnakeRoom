const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

function loadRepair() {
    const context = { console };
    context.window = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(projectRoot, "breeding-repair-helpers.js"), "utf8"),
        context,
        { filename: "breeding-repair-helpers.js" }
    );

    return context.window.BreedingRepair;
}

function loadDataHelpers() {
    const storage = new Map();
    const context = {
        console,
        localStorage: {
            getItem: key => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key),
            clear: () => storage.clear()
        }
    };

    context.window = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(projectRoot, "data-helpers.js"), "utf8"),
        context,
        { filename: "data-helpers.js" }
    );

    return { context, data: context.window.SnakeData, storage };
}

const repair = loadRepair();

function pair(overrides = {}) {
    return {
        id: "pair-1",
        femaleSnakeId: "m1",
        maleSnakeId: "a1",
        pairingDate: "2026-10-01",
        pairings: [{ date: "2026-10-01" }],
        eggsLaidDate: "",
        eggCount: 0,
        ...overrides
    };
}

function clutch(overrides = {}) {
    return {
        id: "2026-01",
        clutchToken: "tc-abc",
        laidDate: "2026-10-15",
        eggCount: 6,
        ...overrides
    };
}

test("a pair pointing at a missing clutch is found, an intact one is not", () => {
    const pairs = [pair({ clutchId: "2026-01" }), pair({ id: "pair-2", clutchId: "" })];
    const found = repair.orphanedPairs(pairs, []);

    assert.equal(found.length, 1);
    assert.equal(found[0].id, "pair-1");
    assert.equal(repair.orphanedPairs(pairs, [clutch()]).length, 0);
});

test("numeric and string clutch ids compare as the same clutch", () => {
    assert.equal(repair.hasClutch([clutch({ id: 2026 })], "2026"), true);
    assert.equal(repair.hasClutch([clutch({ id: "2026" })], 2026), true);
    assert.equal(repair.hasClutch([], "2026"), false);
});

test("repair clears the dead link but keeps the laying cycle and pairings", () => {
    const pairs = [{
        ...pair({ clutchId: "2026-01", eggsLaidDate: "2026-10-15", eggCount: 6 })
    }];
    const result = repair.releaseOrphanedPairs(pairs, []);

    assert.equal(result.released.length, 1);
    assert.equal(result.released[0].clutchId, "2026-01");
    assert.equal(result.released[0].laidDate, "2026-10-15");
    assert.equal(result.pairs[0].clutchId, "");
    assert.equal(result.pairs[0].eggsLaidDate, "2026-10-15");
    assert.equal(result.pairs[0].eggCount, 6);
    assert.deepEqual(result.pairs[0].pairings, [{ date: "2026-10-01" }]);
    // The stored pair is not mutated in place; the caller writes the new array.
    assert.equal(pairs[0].clutchId, "2026-01");
});

test("no orphaned pairs means the same array and no write", () => {
    const pairs = [pair({ clutchId: "" })];
    const result = repair.releaseOrphanedPairs(pairs, []);

    assert.equal(result.pairs, pairs);
    assert.equal(result.released.length, 0);
});

test("closed pairs and pairs with no clutch id are left alone", () => {
    const pairs = [
        pair({ id: "closed", closedAt: "2026-09-01", closedReason: "Test", clutchId: "" }),
        pair({ id: "plain", clutchId: "" })
    ];

    assert.equal(repair.releaseOrphanedPairs(pairs, []).released.length, 0);
});

test("repairStorage writes the pairs back only when something changed", () => {
    const store = {
        saved: null,
        items: {
            breedingPairs: [pair({ clutchId: "2026-01" })],
            clutches: []
        },
        readStorageArray(key, fallback) {
            return this.items[key] === undefined ? fallback : this.items[key];
        },
        saveStorageArray(key, value) {
            this.saved = { key, value };
        }
    };

    const changed = repair.repairStorage(store);

    assert.equal(changed.released.length, 1);
    assert.equal(store.saved.key, "breedingPairs");
    assert.equal(store.saved.value[0].clutchId, "");

    const untouched = {
        saved: null,
        items: { breedingPairs: [pair({ clutchId: "2026-01" })], clutches: [clutch()] },
        readStorageArray(key, fallback) {
            return this.items[key] === undefined ? fallback : this.items[key];
        },
        saveStorageArray() {
            this.saved = { key: "unexpected" };
        }
    };

    assert.equal(repair.repairStorage(untouched).released.length, 0);
    assert.equal(untouched.saved, null);
});

test("the repair line names the clutch and the laying cycle it left behind", () => {
    const lines = repair.describeReleased([{
        pair: pair(),
        clutchId: "2026-01",
        laidDate: "2026-10-15",
        eggCount: 1
    }]);

    assert.equal(lines.length, 1);
    assert.match(lines[0], /2026-01/);
    assert.match(lines[0], /1 egg on 2026-10-15/);
    assert.match(lines[0], /Clear Laying Cycle/);
});

test("a deleted clutch is gone from storage even if an old array writes it back", () => {
    const { data, storage } = loadDataHelpers();
    const deleted = clutch();

    data.saveStorageArray("clutches", [deleted]);
    data.rememberDeletedClutch(deleted);
    data.saveStorageArray("clutches", [deleted]);

    assert.deepEqual(JSON.parse(storage.get("clutches")), []);
    assert.equal(data.readStorageArray("clutches", []).length, 0);
});

test("a clutch re-created under the same id is not hidden", () => {
    const { data, storage } = loadDataHelpers();

    data.rememberDeletedClutch(clutch());
    data.saveStorageArray("clutches", [
        clutch({ clutchToken: "tc-new", laidDate: "2027-10-15" })
    ]);

    assert.equal(JSON.parse(storage.get("clutches")).length, 1);
});

test("two records with the same id but different tokens keep the one not deleted", () => {
    const { data } = loadDataHelpers();

    data.rememberDeletedClutch(clutch({ clutchToken: "tc-old" }));
    data.saveStorageArray("clutches", [
        clutch({ clutchToken: "tc-old" }),
        clutch({ clutchToken: "tc-current" })
    ]);

    const kept = data.readStorageArray("clutches", []);

    assert.equal(kept.length, 1);
    assert.equal(kept[0].clutchToken, "tc-current");
});

test("a record saved without a token is identified by id and laid date", () => {
    const { data } = loadDataHelpers();
    const legacy = { id: "2025-03", laidDate: "2025-06-01", eggCount: 5 };

    data.rememberDeletedClutch(legacy);
    data.saveStorageArray("clutches", [legacy]);

    assert.equal(data.readStorageArray("clutches", []).length, 0);
});

test("old tombstones expire and the list is capped", () => {
    const { data, storage } = loadDataHelpers();
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();

    storage.set("deletedClutches", JSON.stringify([
        { token: "tc-old", id: "2024-01", laidDate: "", deletedAt: old }
    ]));
    data.rememberDeletedClutch(clutch({ clutchToken: "tc-fresh" }));

    const tokens = [...data.readDeletedClutches().map(entry => entry.token)];

    assert.deepEqual(tokens, ["tc-fresh"]);
});

test("a manually deleted record still hides after a restore writes it back", () => {
    const { data, storage } = loadDataHelpers();
    const deleted = clutch();

    data.rememberDeletedClutch(deleted);
    // A cloud restore writes straight to storage, not through saveStorageArray.
    storage.set("clutches", JSON.stringify([deleted]));

    assert.equal(data.readStorageArray("clutches", []).length, 0);
    // Reading also leaves the stored copy alone rather than rewriting it.
    assert.equal(JSON.parse(storage.get("clutches")).length, 1);
});
