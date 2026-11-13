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
    fs.readFileSync(path.join(projectRoot, "banana-maker-helpers.js"), "utf8"),
    context,
    { filename: "banana-maker-helpers.js" }
);

const maker = context.window.BananaMaker;
const { createAppContext } = require("./helpers/load-app");

function banana(overrides = {}) {
    return {
        name: "Freckles",
        sex: "Male",
        genes: [{ name: "Banana", type: "codom", copies: 1 }],
        ...overrides
    };
}

function femaleBanana(overrides = {}) {
    return banana({ name: "Luna", sex: "Female", ...overrides });
}

test("Coral Glow is read as the Banana gene, not a separate morph", () => {
    const app = createAppContext();
    const parsed = app.window.GeneTools.parseGeneInput("Coral Glow Lesser");

    assert.equal(parsed.genes.map(gene => gene.name).join(","), "Banana,Lesser");
    assert.equal(parsed.unknown.length, 0);
    assert.equal(app.window.GeneTools.findGene("Coral Glow").name, "Banana");
    assert.equal(app.window.GeneTools.findGene("CG").name, "Banana");
});

test("Banana and Coral Glow are recognised under both names", () => {
    ["Banana", "banana", "Coral Glow", "coral-glow", "Super Banana", "Super Coral Glow"]
        .forEach(name => assert.equal(maker.isBananaName(name), true, name));

    ["Cinnamon", "Banana Lesser", "Coral", "Normal", ""]
        .forEach(name => assert.equal(maker.isBananaName(name), false, name));
});

test("a visual Banana counts, a possible het does not", () => {
    assert.equal(maker.hasBananaVisual([{ name: "Banana", copies: 1 }]), true);
    assert.equal(maker.hasBananaVisual([{ name: "Coral Glow", copies: 1 }]), true);
    assert.equal(maker.hasBananaVisual([{ name: "Banana", copies: 2 }]), true);
    assert.equal(maker.hasBananaVisual([{ name: "Banana", copies: 1, hetOdds: 0.66 }]), false);
    assert.equal(maker.hasBananaVisual([{ name: "Banana", copies: 0 }]), false);
    assert.equal(maker.hasBananaVisual([{ name: "Pastel", copies: 1 }]), false);
    assert.equal(maker.hasBananaVisual("Banana"), false);
});

test("older records that keep the morph in text are still read", () => {
    assert.equal(maker.snakeHasBanana({ morph: "Banana Lesser" }), true);
    assert.equal(maker.snakeHasBanana({ ID: "Coral Glow Cinnamon" }), true);
    assert.equal(maker.snakeHasBanana({ morph: "Pastel", genes: [] }), false);
    assert.equal(maker.snakeHasBanana(null), false);
});

test("a Banana dam makes the male a female maker", () => {
    const state = maker.deriveMaker({
        ...banana(),
        dam: femaleBanana(),
        damLabel: "Luna - Banana Lesser"
    });

    assert.equal(state.maker, "female");
    assert.equal(state.source, "dam");
    assert.match(state.note, /female maker/i);
});

test("a Banana sire makes the male a male maker", () => {
    const state = maker.deriveMaker({
        ...banana(),
        sire: banana({ name: "Freckles Sr" }),
        sireLabel: "Freckles Sr - Banana Cinnamon"
    });

    assert.equal(state.maker, "male");
    assert.equal(state.source, "sire");
});

test("both Banana parents leave the maker for the keeper to choose", () => {
    const state = maker.deriveMaker({
        ...banana(),
        dam: femaleBanana(),
        sire: banana()
    });

    assert.equal(state.maker, "");
    assert.equal(state.source, "both");
    assert.match(state.note, /both parents/i);
});

test("unknown parentage does not invent a maker", () => {
    const state = maker.deriveMaker(banana());

    assert.equal(state.maker, "");
    assert.equal(state.source, "unknown");
});

test("parent labels still work once the parent has left the collection", () => {
    const state = maker.deriveMaker({
        ...banana(),
        dam: null,
        sire: null,
        damLabel: "Luna (no longer in the collection) - Banana Lesser"
    });

    assert.equal(state.maker, "female");
});

test("only a male Banana can be a maker", () => {
    assert.equal(maker.deriveMaker(femaleBanana()).maker, "");
    assert.equal(maker.deriveMaker(femaleBanana()).source, "none");
    assert.equal(maker.deriveMaker(banana({ sex: "Unknown" })).maker, "");

    const pastel = maker.deriveMaker({
        name: "Artax",
        sex: "Male",
        genes: [{ name: "Pastel", copies: 1 }],
        dam: femaleBanana()
    });

    assert.equal(pastel.maker, "");
    assert.equal(pastel.source, "none");
});

test("a stored maker wins and a disagreement is reported", () => {
    const snakes = [femaleBanana({ id: "dam-1" })];
    const male = banana({ id: "male-1", damId: "dam-1", bananaMaker: "male" });
    const resolved = maker.resolveMaker(male, snakes);

    assert.equal(resolved.maker, "male");
    assert.equal(resolved.source, "recorded");
    assert.equal(resolved.derived, "female");
    assert.equal(resolved.disagrees, true);
    assert.equal(resolved.label, "Male maker");
});

test("without a stored maker the parents supply one", () => {
    const snakes = [banana({ id: "sire-1", name: "Freckles Sr" })];
    const male = banana({ id: "male-1", sireId: "sire-1" });
    const resolved = maker.resolveMaker(male, snakes);

    assert.equal(resolved.maker, "male");
    assert.equal(resolved.source, "sire");
    assert.equal(resolved.derivedSource, "sire");
    assert.equal(resolved.disagrees, false);
});

test("a stored maker is ignored on a female or a non-Banana male", () => {
    const female = femaleBanana({ bananaMaker: "male" });
    const pastel = banana({
        sex: "Male",
        genes: [{ name: "Pastel", copies: 1 }],
        morph: "Pastel",
        bananaMaker: "male"
    });

    assert.equal(maker.resolveMaker(female, []).maker, "");
    assert.equal(maker.resolveMaker(pastel, []).maker, "");
});

test("the maker reads as a badge with an explanation", () => {
    const badge = maker.getBadge(banana({ bananaMaker: "female" }), []);

    assert.equal(badge.label, "Female maker");
    assert.equal(badge.className, "is-female-maker");
    assert.match(badge.title, /mostly female/i);
    assert.match(badge.title, /Recorded on this snake/);

    assert.equal(maker.getBadge(banana({ dam: femaleBanana() }), []), null);
    assert.equal(maker.getBadge(femaleBanana({ bananaMaker: "male" }), []), null);
});

test("a male maker sire puts the Banana hatchlings on the male side", () => {
    const split = maker.getPairSexSplit({
        sireHasBanana: true,
        sireMaker: "male",
        damHasBanana: false
    });

    assert.equal(split.bananaSex, "male");
    assert.equal(split.otherSex, "female");
    assert.match(split.note, /male maker/i);
});

test("a female maker sire puts the Banana hatchlings on the female side", () => {
    const split = maker.getPairSexSplit({
        sireHasBanana: true,
        sireMaker: "female",
        damHasBanana: false
    });

    assert.equal(split.bananaSex, "female");
    assert.equal(split.otherSex, "male");
});

test("a Banana dam alone does not decide the sex of her Banana offspring", () => {
    // She has no maker: her Banana hatchlings can be male or female.
    assert.equal(maker.getPairSexSplit({ damBananaCopies: 1 }), null);
    assert.equal(maker.getPairSexSplit({ sireHasBanana: false, damHasBanana: true }), null);
    assert.match(maker.describeDamOnlySexNote(), /can be male or female/i);
    // In the keeper's words: a Banana dam can throw Banana daughters, not
    // only Banana sons.
    assert.match(maker.describeDamOnlySexNote(), /Banana daughters/i);
    assert.match(maker.describeDamOnlySexNote(), /Banana sons/i);

    // A Banana sire with her still leaves the single Bananas on both sides,
    // which is the same thing seen from the other parent.
    const both = maker.getPairSexSplit({ damBananaCopies: 1, sireBananaCopies: 1 });

    assert.equal(maker.getOutcomeSex(both, 1), "both");
});

test("a pairing that cannot settle the sex shows no split", () => {
    // A Banana sire with no recorded maker.
    assert.equal(maker.getPairSexSplit({ sireHasBanana: true, sireMaker: "", damHasBanana: false }), null);
    // A possible het parent is not a Banana parent at all.
    assert.equal(maker.getPairSexSplit({ sireHasBanana: false, sireMaker: "male", damHasBanana: false }), null);
    assert.equal(maker.getPairSexSplit(), null);
});

test("banana x banana makes the Super Banana the male offspring", () => {
    const split = maker.getPairSexSplit({
        damBananaCopies: 1,
        sireBananaCopies: 1,
        sireMaker: "male"
    });

    assert.equal(split.mode, "both");
    assert.equal(maker.getOutcomeSex(split, 2), "male");
    assert.equal(maker.getOutcomeSex(split, 1), "both");
    assert.equal(maker.getOutcomeSex(split, 0), "both");
    assert.match(split.note, /Super Banana hatchlings are the male/i);
    assert.equal(maker.describeSexSplit(split), "Super Banana: Male · the rest: Male / Female.");

    // The maker does not change the Super Banana / rest map.
    const femaleMaker = maker.getPairSexSplit({
        damBananaCopies: 1,
        sireBananaCopies: 1,
        sireMaker: "female"
    });

    assert.equal(maker.getOutcomeSex(femaleMaker, 2), "male");
    assert.equal(maker.getOutcomeSex(femaleMaker, 1), "both");
    assert.equal(maker.getOutcomeSex(femaleMaker, 0), "both");
});

test("a Super Banana sire with a Banana dam leaves the rest unsexed", () => {
    const split = maker.getPairSexSplit({ damBananaCopies: 1, sireBananaCopies: 2 });

    assert.equal(split.mode, "both");
    assert.equal(maker.getOutcomeSex(split, 2), "male");
    assert.equal(maker.getOutcomeSex(split, 1), "both");
    assert.equal(maker.getOutcomeSex(split, 0), "both");
});

test("a Super Banana sire passes Banana to every hatchling", () => {
    const split = maker.getPairSexSplit({ sireBananaCopies: 2, sireMaker: "male" });

    assert.equal(split.mode, "sire-super");
    assert.equal(maker.getOutcomeSex(split, 2), "both");
    assert.equal(maker.getOutcomeSex(split, 1), "both");
    assert.equal(maker.getOutcomeSex(split, 0), "");
});

test("Banana copies read as none, single and super", () => {
    assert.equal(maker.getBananaCopies([{ name: "Banana", copies: 1 }]), 1);
    assert.equal(maker.getBananaCopies([{ name: "Super Banana", copies: 2 }]), 2);
    assert.equal(maker.getBananaCopies([{ name: "Coral Glow", copies: 2 }]), 2);
    assert.equal(maker.getBananaCopies([{ name: "Banana", copies: 1, hetOdds: 0.66 }]), 0);
    assert.equal(maker.getBananaCopies([{ name: "Pastel", copies: 1 }]), 0);
    assert.equal(maker.getBananaCopies([]), 0);
});

test("an outcome takes the Banana side or the other side of the split", () => {
    const split = maker.getPairSexSplit({ sireHasBanana: true, sireMaker: "female" });

    assert.equal(maker.getOutcomeSex(split, 1), "female");
    assert.equal(maker.getOutcomeSex(split, 0), "male");
    assert.equal(maker.getOutcomeSex(null, 1), "");
    assert.equal(maker.getOutcomeSexForGenes(split, [{ name: "Banana", copies: 1 }]), "female");
    assert.equal(maker.getOutcomeSexForGenes(split, [{ name: "Pastel", copies: 1 }]), "male");
    assert.equal(maker.describeSex("male"), "Male");
    assert.equal(maker.describeSex("both"), "Male / Female");
    assert.equal(maker.describeSex(""), "");
    assert.equal(maker.describeSexSplit(split), "Banana hatchlings: Female · the rest: Male.");
});

test("maker labels and offspring lines agree", () => {
    assert.equal(maker.describeMaker("male").label, "Male maker");
    assert.equal(maker.describeMaker("Female maker").label, "Female maker");
    assert.equal(maker.describeMaker("").label, "");
    assert.match(maker.describeMaker("male").offspring, /mostly male/i);
    assert.equal(maker.normalizeMaker("female maker"), "female");
    assert.equal(maker.normalizeMaker("M"), "male");
    assert.equal(maker.normalizeMaker("neither"), "");
});
