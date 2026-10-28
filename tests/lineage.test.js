const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = { console };
context.window = context;

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(projectRoot, "lineage.js"), "utf8"), context);

const lineage = context.window.SnakeLineage;

function snake(id, name, sireId = "", damId = "") {
    return { id, name, sireId, damId };
}

// A/B are the founders. C is their clean child, and D is C x I (a simple
// parent-offspring pair). J is B x C (one close breeding in J's tree), and K
// is A x J (a second close breeding stacked on the first).
const snakes = [
    snake("a", "A"),
    snake("b", "B"),
    snake("c", "C", "a", "b"),
    snake("i", "I"),
    snake("d", "D", "c", "i"),
    snake("j", "J", "b", "c"),
    snake("k", "K", "a", "j")
];

const a = snakes[0];
const b = snakes[1];
const c = snakes[2];
const i = snakes[3];
const d = snakes[4];
const j = snakes[5];
const k = snakes[6];

test("parent and offspring have the expected coefficient", () => {
    assert.equal(lineage.relationshipCoefficient(c, d, lineage.buildIndex(snakes)), 0.25);
    assert.equal(lineage.relationshipLabel(c, d, lineage.buildIndex(snakes)), "Parent–offspring");
});

test("full siblings have the expected coefficient", () => {
    const sibling = snake("sibling", "Sibling", "a", "b");
    const index = lineage.buildIndex([...snakes, sibling]);

    assert.equal(lineage.relationshipCoefficient(c, sibling, index), 0.25);
    assert.equal(lineage.relationshipLabel(c, sibling, index), "Full siblings");
});

test("a single close breeding in the tree is reported", () => {
    const result = lineage.findCloseBreedings(j, i, snakes);

    assert.equal(result.count, 1);
    assert.equal(result.multiple, false);
    assert.equal(result.events[0].child.id, "j");
});

test("two close breedings in the tree are flagged as multiple", () => {
    const result = lineage.findCloseBreedings(k, i, snakes);

    assert.equal(result.count, 2);
    assert.equal(result.multiple, true);
    assert.equal(
        result.events.map(event => event.child.id).sort().join(","),
        "j,k"
    );
});

test("legacy parent labels resolve when IDs are absent", () => {
    const legacy = [
        snake("x", "X"),
        snake("y", "Y"),
        { id: "z", name: "Z", sire: "X", dam: "Y" }
    ];
    const index = lineage.buildIndex(legacy);
    const parents = lineage.getParents(legacy[2], index);

    assert.equal(parents.map(parent => parent.id).sort().join(","), "x,y");
});

test("a proposed parent-offspring pairing is reported without blocking it", () => {
    const result = lineage.findCloseBreedings(c, d, snakes);
    const proposed = result.events.find(event => event.type === "proposed");

    assert.ok(proposed);
    assert.equal(proposed.label, "Parent–offspring");
    assert.equal(proposed.coefficient, 0.25);
});

test("an unrelated pair with clean ancestry produces no warning", () => {
    const result = lineage.findCloseBreedings(a, i, snakes);

    assert.equal(result.count, 0);
    assert.equal(result.multiple, false);
});
