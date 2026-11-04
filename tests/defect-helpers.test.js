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
    fs.readFileSync(path.join(projectRoot, "defect-helpers.js"), "utf8"),
    context,
    { filename: "defect-helpers.js" }
);

const defects = context.window.SnakeDefects;

test("the catalog carries the defects a keeper records", () => {
    const labels = defects.DEFECTS.map(defect => defect.label);

    ["Shark mouth", "No eyes", "Kinked", "Bug eyes", "Small eyes"].forEach(label => {
        assert.ok(labels.includes(label), `${label} is in the catalog`);
    });
});

test("keys, labels and loose spellings all normalize to one key", () => {
    assert.equal(defects.normalize("shark-mouth"), "shark-mouth");
    assert.equal(defects.normalize("Shark Mouth"), "shark-mouth");
    assert.equal(defects.normalize("no eyes"), "no-eyes");
    assert.equal(defects.normalize("Kinked tail"), "kinking");
    assert.equal(defects.normalize("bug eye (left)"), "bug-eyes");
    assert.equal(defects.normalize("small eye"), "small-eyes");
    assert.equal(defects.normalize("duck bill"), "duckbill");
    // An unknown problem is still a problem, never dropped.
    assert.equal(defects.normalize("swollen vent"), "other");
    assert.equal(defects.normalize(""), "");
});

test("a snake can carry several defects, and each is counted once", () => {
    const snake = { defects: ["kinking", "Kinked", "Shark mouth"] };

    assert.deepEqual(Array.from(defects.keys(snake)), ["kinking", "shark-mouth"]);
    assert.deepEqual(Array.from(defects.labels(snake)), ["Kinked", "Shark mouth"]);
    assert.equal(defects.summary(snake), "Kinked, Shark mouth");
    assert.equal(defects.has(snake), true);
});

test("older single-defect records and comma strings still read", () => {
    assert.deepEqual(Array.from(defects.keys({ defect: "Shark mouth" })), ["shark-mouth"]);
    assert.deepEqual(Array.from(defects.keys({ defects: "bug eyes, no eyes" })), ["bug-eyes", "no-eyes"]);
    assert.deepEqual(Array.from(defects.keys({})), []);
    assert.equal(defects.has({}), false);
});

test("tally counts animals per defect, biggest group first", () => {
    const animals = [
        { defects: ["kinking", "shark-mouth"] },
        { defects: ["kinking"] },
        { defects: ["no-eyes"] },
        { defects: [] }
    ];

    assert.deepEqual(
        Array.from(defects.tally(animals), item => `${item.label}:${item.count}`),
        ["Kinked:2", "No eyes:1", "Shark mouth:1"]
    );
});
