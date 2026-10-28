const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppContext } = require("./helpers/load-app");

const { window } = createAppContext();
const calculator = window.MorphCalculator;

function calculateClownPair() {
    return calculator.calculatePairing(
        [
            { name: "Clown", type: "recessive", copies: 2 },
            { name: "Leopard", type: "codominant", copies: 1 },
            { name: "Spotnose", type: "codominant", copies: 1 }
        ],
        [
            { name: "Clown", type: "recessive", copies: 2 },
            { name: "Leopard", type: "codominant", copies: 1 },
            { name: "Spotnose", type: "codominant", copies: 1 }
        ]
    );
}

test("Clown + Leopard + Spotnose resolves to Batman", () => {
    const batman = calculateClownPair().find(outcome => outcome.morphName === "Batman");

    assert.ok(batman, "expected a Batman outcome");
    assert.equal(batman.probability, 0.25);
    assert.equal(
        batman.geneDetails.map(gene => gene.label).join(", "),
        "Leopard, Spotnose, Clown"
    );
});

test("the recessive is the last gene pill in a combo", () => {
    const batman = calculateClownPair().find(outcome => outcome.morphName === "Batman");

    assert.equal(batman.geneDetails.at(-1).name, "Clown");
    assert.ok(!batman.geneDetails.some(gene => /visual/i.test(gene.label)));
});

test("a fallback morph name lists the recessive last", () => {
    const outcomes = calculator.calculatePairing(
        [
            { name: "Clown", type: "recessive", copies: 2 },
            { name: "Fire", type: "codominant", copies: 1 }
        ],
        [
            { name: "Clown", type: "recessive", copies: 2 },
            { name: "Fire", type: "codominant", copies: 1 }
        ]
    );

    assert.ok(
        outcomes.some(outcome => outcome.morphName === "Fire Clown"),
        `expected Fire Clown in ${outcomes.map(outcome => outcome.morphName).join(", ")}`
    );
});

test("a het carrier also sorts after the base morph", () => {
    const outcomes = calculator.calculatePairing(
        [
            { name: "Clown", type: "recessive", copies: 1 },
            { name: "Fire", type: "codominant", copies: 1 }
        ],
        [
            { name: "Clown", type: "recessive", copies: 1 },
            { name: "Fire", type: "codominant", copies: 1 }
        ]
    );

    const carrier = outcomes.find(outcome =>
        outcome.geneDetails.some(gene => gene.name === "Clown" && /Het Clown$/.test(gene.label))
        && outcome.geneDetails.some(gene => gene.name === "Fire")
    );

    assert.ok(carrier, "expected an outcome with both Fire and a Clown carrier");
    assert.equal(carrier.geneDetails.at(-1).name, "Clown");
    assert.ok(/Het Clown$/.test(carrier.geneDetails.at(-1).label));
});
