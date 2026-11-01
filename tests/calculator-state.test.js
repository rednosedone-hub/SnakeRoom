const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { projectRoot } = require("./helpers/load-app");

function fakeStore() {
    const items = new Map();

    return {
        items,
        getItem: key => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: key => items.delete(key)
    };
}

function createState(store = fakeStore()) {
    const context = {
        console,
        sessionStorage: store
    };

    context.window = context;
    context.globalThis = context;

    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(projectRoot, "calculator-state.js"), "utf8"),
        context,
        { filename: "calculator-state.js" }
    );

    return { state: context.CalculatorState, store };
}

// Objects come back from the vm realm, so compare their JSON rather than their
// prototypes.
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

test("a saved pairing keeps copy counts and possible het odds", () => {
    const { state } = createState();
    const pairing = plain(state.normalizePairing({
        female: [
            { name: "Pastel", copies: 2 },
            { name: "Clown", copies: 1, hetOdds: 0.66 }
        ],
        male: [{ name: "  Lesser  ", copies: 9 }]
    }));

    assert.deepEqual(pairing.female, [
        { name: "Pastel", copies: 2 },
        { name: "Clown", copies: 1, hetOdds: 0.66 }
    ]);
    assert.deepEqual(pairing.male, [{ name: "Lesser", copies: 2 }]);
});

test("junk in a saved pairing is dropped instead of half restored", () => {
    const { state } = createState();
    const pairing = plain(state.normalizePairing({
        female: [
            null,
            { name: "" },
            { name: "Clown", copies: 0, hetOdds: 1 }
        ],
        male: "not a list"
    }));

    assert.deepEqual(pairing.female, [{ name: "Clown", copies: 1 }]);
    assert.deepEqual(pairing.male, []);
    assert.equal(pairing.femaleSnakeId, "");
});

test("the round trip restores both parents and the animals they came from", () => {
    const { state, store } = createState();
    const saved = {
        female: [{ name: "Pastel", copies: 1 }],
        male: [{ name: "Clown", copies: 2 }],
        femaleSnakeId: "snake-a",
        maleSnakeId: "snake-b"
    };

    assert.equal(state.write(saved), true);
    assert.ok(store.items.has(state.STORAGE_KEY));
    assert.deepEqual(plain(state.read()), saved);

    assert.equal(state.clear(), true);
    assert.deepEqual(plain(state.read()), {
        female: [],
        male: [],
        femaleSnakeId: "",
        maleSnakeId: ""
    });
});

test("a half-written save reads as an empty pairing", () => {
    const store = fakeStore();
    const { state } = createState(store);

    store.setItem(state.STORAGE_KEY, "{not json");

    assert.deepEqual(plain(state.read()), {
        female: [],
        male: [],
        femaleSnakeId: "",
        maleSnakeId: ""
    });
});

test("a store that refuses to save costs only the restore", () => {
    const broken = {
        getItem() {
            throw new Error("denied");
        },
        setItem() {
            throw new Error("denied");
        },
        removeItem() {
            throw new Error("denied");
        }
    };
    const { state } = createState(broken);

    assert.equal(state.write({ female: [{ name: "Pastel", copies: 1 }] }), false);
    assert.deepEqual(plain(state.read()).female, []);
    assert.equal(state.clear(), false);
});

test("only a pairing with genes is worth restoring", () => {
    const { state } = createState();

    assert.equal(state.hasGenes({}), false);
    assert.equal(state.hasGenes({ femaleSnakeId: "snake-a", maleSnakeId: "snake-b" }), false);
    assert.equal(state.hasGenes({ male: [{ name: "Pastel", copies: 1 }] }), true);
});
