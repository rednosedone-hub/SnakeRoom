const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppContext } = require("./helpers/load-app");

const { window } = createAppContext();
const genes = window.GeneTools;

test("a visual recessive is named without a Visual suffix", () => {
    assert.equal(
        genes.describeGene({ name: "Clown", type: "recessive", copies: 2 }),
        "Clown"
    );
    assert.equal(
        genes.describeGene({ name: "Pied", type: "recessive", copies: 2 }),
        "Pied"
    );
});

test("proven and possible hets keep their carrier labels", () => {
    assert.equal(
        genes.describeGene({ name: "Clown", type: "recessive", copies: 1 }),
        "100% Het Clown"
    );
    assert.equal(
        genes.describeGene({ name: "Clown", type: "recessive", copies: 1, hetOdds: 0.66 }),
        "66% Het Clown"
    );
    assert.equal(
        genes.describeGene({ name: "Clown", type: "recessive", copies: 1, hetOdds: 0.5 }),
        "50% Het Clown"
    );
});

test("co-dominant genes keep their normal and super names", () => {
    assert.equal(
        genes.describeGene({ name: "Fire", type: "codominant", copies: 1 }),
        "Fire"
    );
    assert.equal(
        genes.describeGene({ name: "Pastel", type: "codominant", copies: 2 }),
        "Super Pastel"
    );
});

test("describeGenes puts recessives after the base morphs", () => {
    assert.deepEqual(
        genes.describeGenes([
            { name: "Clown", type: "recessive", copies: 2 },
            { name: "Fire", type: "codominant", copies: 1 }
        ]),
        ["Fire", "Clown"]
    );

    assert.deepEqual(
        genes.describeGenes([
            { name: "Clown", type: "recessive", copies: 1 },
            { name: "Fire", type: "codominant", copies: 1 }
        ]),
        ["Fire", "100% Het Clown"]
    );
});

test("multiple recessives stay last while base morphs keep their order", () => {
    assert.deepEqual(
        genes.describeGenes([
            { name: "Clown", type: "recessive", copies: 2 },
            { name: "Fire", type: "codominant", copies: 1 },
            { name: "Pied", type: "recessive", copies: 2 },
            { name: "Pastel", type: "codominant", copies: 1 }
        ]),
        ["Fire", "Pastel", "Clown", "Pied"]
    );
});

test("a record without a stored type is still ordered by its catalog entry", () => {
    assert.deepEqual(
        genes.describeGenes([
            { name: "Clown", copies: 2 },
            { name: "Fire", copies: 1 }
        ]),
        ["Fire", "Clown"]
    );
});

test("display sorting does not mutate the stored gene list", () => {
    const stored = [
        { name: "Clown", type: "recessive", copies: 2 },
        { name: "Fire", type: "codominant", copies: 1 }
    ];

    genes.sortGenesForDisplay(stored);

    assert.deepEqual(stored.map(gene => gene.name), ["Clown", "Fire"]);
});
