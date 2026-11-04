const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppContext } = require("./helpers/load-app");

const { window } = createAppContext();
const genes = window.GeneTools;

function names(value) {
    return Array.from(genes.parseGeneInput(value).genes, gene => gene.name);
}

test("shortcuts resolve to the catalog gene", () => {
    assert.equal(genes.findGene("YB").name, "Yellow Belly");
    assert.equal(genes.findGene("yb").name, "Yellow Belly");
    assert.equal(genes.findGene("OD").name, "Orange Dream");
    assert.equal(genes.findGene("SN").name, "Spotnose");
    assert.equal(genes.findGene("Pin").name, "Pinstripe");
    assert.equal(genes.findGene("Cl").name, "Clown");
    assert.equal(genes.findGene("HRA").name, "Het Red Axanthic");
    assert.equal(genes.findGene("HGW").name, "Hidden Gene Woma");
});

test("names without spaces and loose punctuation still resolve", () => {
    assert.equal(genes.findGene("yellowbelly").name, "Yellow Belly");
    assert.equal(genes.findGene("Orange_Dream").name, "Orange Dream");
    assert.equal(genes.findGene("Y. Belly").name, "Yellow Belly");
    assert.equal(genes.findGene("b-pastel").name, "Black Pastel");
});

test("autocomplete search matches shortcuts and names", () => {
    assert.ok(genes.searchGenes("yb").some(gene => gene.name === "Yellow Belly"));
    assert.ok(genes.searchGenes("yellow").some(gene => gene.name === "Yellow Belly"));
    assert.ok(genes.searchGenes("pin").some(gene => gene.name === "Pinstripe"));
    assert.deepEqual(Array.from(genes.searchGenes("")), []);
});

test("several shortcuts in one entry become several genes", () => {
    assert.deepEqual(names("YB OD SN"), ["Yellow Belly", "Orange Dream", "Spotnose"]);
    assert.deepEqual(names("YB, OD, SN"), ["Yellow Belly", "Orange Dream", "Spotnose"]);
    assert.deepEqual(names("yb od sn"), ["Yellow Belly", "Orange Dream", "Spotnose"]);
    assert.deepEqual(names("Yellow Belly Orange Dream Spotnose"), ["Yellow Belly", "Orange Dream", "Spotnose"]);
});

test("co-dominant shortcuts are one copy, recessive ones are the visual form", () => {
    const combo = genes.parseGeneInput("YB OD SN Clown");

    assert.deepEqual(Array.from(combo.genes, gene => `${gene.name}:${gene.copies}`), [
        "Yellow Belly:1",
        "Orange Dream:1",
        "Spotnose:1",
        "Clown:2"
    ]);
});

test("super, het and possible-het modifiers apply to the gene after them", () => {
    const superPastel = genes.parseGeneInput("Super Pastel").genes[0];
    const ivory = genes.parseGeneInput("Ivory").genes[0];
    const hetClown = genes.parseGeneInput("Het Clown").genes[0];
    const possible = genes.parseGeneInput("66% Het Clown").genes[0];
    const mixed = genes.parseGeneInput("OD super Pastel");

    assert.equal(superPastel.name, "Pastel");
    assert.equal(superPastel.copies, 2);
    assert.equal(superPastel.label, "Super Pastel");

    // A catalog super name means the same thing as writing "Super ...".
    assert.equal(ivory.name, "Yellow Belly");
    assert.equal(ivory.copies, 2);

    assert.equal(hetClown.copies, 1);
    assert.equal(hetClown.hetOdds, undefined);
    assert.equal(hetClown.label, "100% Het Clown");

    assert.equal(possible.copies, 1);
    assert.equal(possible.hetOdds, 0.66);
    assert.equal(possible.label, "66% Het Clown");

    assert.deepEqual(Array.from(mixed.genes, gene => `${gene.name}:${gene.copies}`), [
        "Orange Dream:1",
        "Pastel:2"
    ]);
});

test("a repeated gene is stored once", () => {
    const parsed = genes.parseGeneInput("YB yellow belly");

    assert.equal(parsed.genes.length, 1);
    assert.equal(parsed.genes[0].copies, 1);
});

test("unknown words are reported instead of guessed at", () => {
    const parsed = genes.parseGeneInput("YB zzz");

    assert.deepEqual(Array.from(parsed.genes, gene => gene.name), ["Yellow Belly"]);
    assert.deepEqual(Array.from(parsed.unknown), ["zzz"]);
    assert.deepEqual(Array.from(genes.parseGeneInput("").genes), []);
});

test("a gene reports its shortcuts for the autocomplete list", () => {
    assert.ok(genes.getGeneAliases("Yellow Belly").includes("YB"));
    assert.ok(genes.getGeneAliasEntries().some(entry => entry.alias === "OD" && entry.gene === "Orange Dream"));
});

// ---- Shortcuts the keeper adds themselves ------------------------------

function removeTestAliases() {
    genes.getCustomGeneAliases().forEach(entry => genes.removeGeneAlias(entry.alias));
}

test("a keeper's own shortcut resolves everywhere a gene is typed", () => {
    removeTestAliases();

    const result = genes.setGeneAlias("bl", "Banana");

    assert.equal(result.ok, true);
    assert.equal(genes.findGene("bl").name, "Banana");
    assert.deepEqual(names("bl OD"), ["Banana", "Orange Dream"]);
    assert.ok(genes.searchGenes("bl").some(gene => gene.name === "Banana"));
    assert.ok(genes.getGeneAliases("Banana").includes("BL"));

    const entry = genes.getGeneAliasEntries()
        .find(item => item.alias === "BL" && item.gene === "Banana");

    assert.equal(entry.custom, true);
});

test("a custom shortcut can be several words and keeps its case", () => {
    removeTestAliases();
    genes.setGeneAlias("fancy name", "Pastel");

    const banana = genes.parseGeneInput("fancy name");

    assert.deepEqual(Array.from(banana.genes, gene => gene.name), ["Pastel"]);
    assert.equal(genes.getCustomGeneAliases()[0].alias, "fancy name");
});

test("editing a shortcut replaces it instead of adding a second row", () => {
    removeTestAliases();
    genes.setGeneAlias("bl", "Banana");

    const edited = genes.setGeneAlias("ban", "Banana", "bl");

    assert.equal(edited.ok, true);
    assert.equal(genes.findGene("bl"), undefined);
    assert.equal(genes.findGene("ban").name, "Banana");
    assert.deepEqual(
        Array.from(genes.getCustomGeneAliases(), entry => entry.alias),
        ["ban"]
    );
});

test("retargeting the same shortcut keeps one row with the new gene", () => {
    removeTestAliases();
    genes.setGeneAlias("bl", "Banana");
    genes.setGeneAlias("bl", "Pastel", "bl");

    assert.equal(genes.findGene("bl").name, "Pastel");
    assert.equal(genes.getCustomGeneAliases().length, 1);
});

test("deleting a shortcut restores the plain meaning", () => {
    removeTestAliases();
    genes.setGeneAlias("bl", "Banana");

    assert.equal(genes.removeGeneAlias("bl"), true);
    assert.equal(genes.findGene("bl"), undefined);
    assert.equal(genes.removeGeneAlias("bl"), false);
});

test("empty, unknown and gene-name aliases are refused with a reason", () => {
    removeTestAliases();

    const empty = genes.setGeneAlias("  ", "Banana");
    const unknownGene = genes.setGeneAlias("bl", "Not A Real Gene");
    const geneName = genes.setGeneAlias("Pastel", "Banana");
    const punctuation = genes.setGeneAlias("b!l", "Banana");

    assert.equal(empty.ok, false);
    assert.equal(unknownGene.ok, false);
    assert.equal(geneName.ok, false);
    assert.match(geneName.error, /already a gene name/);
    assert.equal(punctuation.ok, false);
    assert.deepEqual(Array.from(genes.getCustomGeneAliases()), []);
});

test("a keeper's shortcut can replace a built-in meaning until deleted", () => {
    removeTestAliases();

    const override = genes.setGeneAlias("yb", "Banana");

    assert.equal(override.ok, true);
    assert.equal(override.replacedBuiltIn, "Yellow Belly");
    assert.equal(genes.findGene("yb").name, "Banana");
    assert.equal(genes.parseGeneInput("YB").genes[0].name, "Banana");
    assert.ok(!genes.getGeneAliases("Yellow Belly").includes("YB"));

    genes.removeGeneAlias("yb");

    assert.equal(genes.findGene("yb").name, "Yellow Belly");
});

test("the same shortcut cannot point at two genes", () => {
    removeTestAliases();
    genes.setGeneAlias("bl", "Banana");

    const clash = genes.setGeneAlias("BL", "Pastel");

    assert.equal(clash.ok, false);
    assert.match(clash.error, /already your shortcut/);
    assert.equal(genes.findGene("bl").name, "Banana");
});

test("saved shortcuts are written where the rest of the app data lives", () => {
    removeTestAliases();
    genes.setGeneAlias("bl", "Banana");

    assert.deepEqual(
        JSON.parse(window.localStorage.getItem("customGeneAliases")),
        [{ alias: "bl", gene: "Banana" }]
    );

    removeTestAliases();
});

// ---- Spreadsheet import -------------------------------------------------

test("gene rows become custom genes with the form's defaults", () => {
    const result = genes.importCustomGenes([
        {
            name: "Test Recessive",
            type: "recessive",
            superType: "lethal",
            allelicGroup: "test-complex"
        },
        {
            name: "Test Codom",
            type: "co-dom",
            superType: "lethal",
            superName: "Super Test Codom",
            health: "test note"
        },
        { name: "Yellow Belly", type: "codom" },
        { name: "", type: "codom" }
    ]);

    assert.equal(result.added, 2);
    assert.equal(result.skipped, 2);

    const recessive = genes.findGene("Test Recessive");
    const codom = genes.findGene("Test Codom");

    assert.equal(recessive.type, "recessive");
    assert.equal(recessive.superType, "visual");
    assert.equal(recessive.allelicGroup, "test-complex");

    assert.equal(codom.type, "codom");
    assert.equal(codom.superType, "lethal");
    assert.equal(codom.superName, "Super Test Codom");
    assert.equal(codom.health, "test note");
});

test("gene import never replaces an existing gene or adds a shortcut as a gene", () => {
    const result = genes.importCustomGenes([
        { name: "Yellow Belly" },
        { name: "YB" }
    ]);

    assert.equal(result.added, 0);
    assert.equal(result.skipped, 2);
    assert.match(result.reasons.join(" "), /already in the catalog/);
    assert.match(result.reasons.join(" "), /shortcut for Yellow Belly/);
});

test("shortcut rows import through the editor's validation", () => {
    removeTestAliases();

    const result = genes.importCustomGeneAliases([
        { alias: "tst", gene: "Test Codom" },
        { alias: "", gene: "Test Codom" },
        { alias: "nope", gene: "Not A Gene" },
        { alias: "Test Codom", gene: "Test Recessive" }
    ]);

    assert.equal(result.imported, 1);
    assert.equal(result.skipped, 3);
    assert.equal(genes.findGene("tst").name, "Test Codom");
    assert.equal(genes.getCustomGeneAliases().length, 1);

    removeTestAliases();
});

test("importing the same shortcut again updates where it points", () => {
    removeTestAliases();

    const result = genes.importCustomGeneAliases([
        { alias: "tst", gene: "Test Codom" },
        { alias: "tst", gene: "Test Recessive" }
    ]);

    assert.equal(result.imported, 2);
    assert.equal(genes.findGene("tst").name, "Test Recessive");
    assert.equal(genes.getCustomGeneAliases().length, 1);

    removeTestAliases();
});
