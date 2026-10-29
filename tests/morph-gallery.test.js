const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createAppContext, projectRoot } = require("./helpers/load-app");

const context = createAppContext();

vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "morph-gallery.js"), "utf8"),
    context,
    { filename: "morph-gallery.js" }
);

const { window } = context;
const gallery = window.MorphGallery;

test("a genotype key ignores gene order", () => {
    const left = gallery.morphKeyFromGenes([
        { name: "Pastel", copies: 1 },
        { name: "Lesser", copies: 1 }
    ]);
    const right = gallery.morphKeyFromGenes([
        { name: "Lesser", copies: 1 },
        { name: "Pastel", copies: 1 }
    ]);

    assert.equal(left, "lesser=1|pastel=1");
    assert.equal(left, right);
});

test("a possible het files under the same key as a proven het", () => {
    assert.equal(
        gallery.morphKeyFromGenes([{ name: "Clown", copies: 1, hetOdds: 0.66 }]),
        gallery.morphKeyFromGenes([{ name: "Clown", copies: 1 }])
    );
});

test("a super is a different key from a single copy", () => {
    assert.notEqual(
        gallery.morphKeyFromGenes([{ name: "Pastel", copies: 2 }]),
        gallery.morphKeyFromGenes([{ name: "Pastel", copies: 1 }])
    );
});

test("no genes is the normal key", () => {
    assert.equal(gallery.morphKeyFromGenes([]), "normal");
    assert.equal(gallery.morphKeyFromGenes(undefined), "normal");
});

test("the gallery names a genotype exactly like the calculator does", () => {
    const genes = [
        { name: "Pastel", copies: 1 },
        { name: "Lesser", copies: 1 }
    ];
    const described = gallery.describeGenotype(genes);
    const calculator = window.MorphCalculator.describeGenotype(genes);

    assert.equal(described.morphName, calculator.morphName);
    assert.deepEqual(described.genes, calculator.genes);
    assert.equal(described.morphName, "Pastel Lesser");
});

test("snake photo candidates drop the placeholder and duplicates", () => {
    assert.deepEqual(
        Array.from(gallery.photoUrlsForSnake({
            image: "https://example.com/main.jpg",
            photos: [
                { url: "https://example.com/main.jpg" },
                { url: "https://example.com/second.jpg" },
                "https://example.com/third.jpg",
                { url: gallery.PLACEHOLDER_PHOTO }
            ]
        })),
        [
            "https://example.com/main.jpg",
            "https://example.com/second.jpg",
            "https://example.com/third.jpg"
        ]
    );
});

test("grouping skips rows without a key or a photo", () => {
    const grouped = gallery.groupPhotos([
        { id: "1", morph_key: "pastel=1", photo_url: "https://example.com/a.jpg" },
        { id: "2", morph_key: "pastel=1", photo_url: "https://example.com/b.jpg" },
        { id: "3", morph_key: "", photo_url: "https://example.com/c.jpg" },
        { id: "4", morph_key: "pastel=1", photo_url: "" }
    ]);

    assert.equal(grouped.size, 1);
    assert.equal(grouped.get("pastel=1").length, 2);
});

test("grouping already-normalized rows keeps their key", () => {
    const grouped = gallery.groupPhotos([
        {
            id: "photo-1",
            morphKey: "pastel=1",
            morphName: "Pastel",
            photoUrl: "https://example.com/pastel.jpg",
            genes: []
        }
    ]);

    assert.equal(grouped.get("pastel=1").length, 1);
    assert.equal(grouped.get("pastel=1")[0].photoUrl, "https://example.com/pastel.jpg");
});

test("a cached example is returned without a network client", async () => {
    const cached = [{
        id: "photo-1",
        morph_key: "pastel=1",
        morph_name: "Pastel",
        genes: [{ name: "Pastel", copies: 1 }],
        photo_url: "https://example.com/pastel.jpg",
        created_at: "2026-01-01T00:00:00Z"
    }];

    window.localStorage.setItem(gallery.CACHE_KEY, JSON.stringify({
        "pastel=1": { at: Date.now(), photos: cached }
    }));

    const examples = await gallery.fetchExamples(["pastel=1"]);

    assert.equal(examples.get("pastel=1").length, 1);
    assert.equal(examples.get("pastel=1")[0].photoUrl, "https://example.com/pastel.jpg");

    // Reading the cache a second time must not blank the normalized fields.
    const again = await gallery.fetchExamples(["pastel=1"]);

    assert.equal(again.get("pastel=1")[0].photoUrl, "https://example.com/pastel.jpg");
    assert.equal(again.get("pastel=1")[0].morphName, "Pastel");
});

test("the browse page falls back to the cache with no connection", async () => {
    const result = await gallery.fetchAll();

    assert.equal(result.fromCache, true);
    assert.equal(result.rows.length, 1);
    assert.equal(result.grouped.get("pastel=1").length, 1);
});
