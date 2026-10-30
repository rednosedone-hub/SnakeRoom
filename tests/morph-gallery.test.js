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

test("bulk publish rows mark what is ready, published or not ready yet", () => {
    const rows = gallery.bulkPublishRows([
        { name: "Ready", genes: [{ name: "Pastel", copies: 1 }], image: "https://example.com/a.jpg" },
        { name: "Done", genes: [{ name: "Pastel", copies: 1 }], image: "https://example.com/b.jpg" },
        { name: "No genes", genes: [], image: "https://example.com/c.jpg" },
        { name: "No photo", genes: [{ name: "Pastel", copies: 1 }], image: gallery.PLACEHOLDER_PHOTO },
        { name: "Local only", genes: [{ name: "Pastel", copies: 1 }], image: "data:image/jpeg;base64,abc" },
        { name: "Same picture", genes: [{ name: "Pastel", copies: 1 }], image: "https://example.com/a.jpg" },
        null
    ], new Set(["https://example.com/b.jpg"]));

    assert.deepEqual(
        Array.from(rows, row => [row.snake.name, row.reason, row.alreadyPublished]),
        [
            ["Ready", "", false],
            ["Done", "", true],
            ["No genes", "No genes yet", false],
            ["No photo", "No photo yet", false],
            ["Local only", "Photo is on this device only", false],
            ["Same picture", "Same photo as another animal", false]
        ]
    );
    assert.equal(rows[0].morphName, "Pastel");
    assert.equal(rows[0].photoUrl, "https://example.com/a.jpg");
});

test("a publication row is the morph and the photo, nothing else", () => {
    const { row, described } = gallery.photoRowFor({
        snake: { name: "Secret pet name", genes: [{ name: "Pastel", copies: 1 }] },
        photoUrl: "https://example.com/pastel.jpg",
        userId: "user-1"
    });

    assert.deepEqual(
        Object.keys(row).sort(),
        ["genes", "morph_key", "morph_name", "photo_url", "user_id"]
    );
    assert.equal(row.user_id, "user-1");
    assert.equal(row.photo_url, "https://example.com/pastel.jpg");
    assert.equal(row.morph_key, "pastel=1");
    assert.equal(row.morph_name, "Pastel");
    assert.equal(described.morphName, "Pastel");
});

test("a photo that only lives on one device is never published", () => {
    assert.throws(() => gallery.photoRowFor({
        snake: { genes: [{ name: "Pastel", copies: 1 }] },
        photoUrl: "data:image/jpeg;base64,abc",
        userId: "user-1"
    }), /uploaded to your cloud storage/);
});

test("a snake with no genes cannot be published to a genotype gallery", () => {
    assert.throws(() => gallery.photoRowFor({
        snake: { genes: [] },
        photoUrl: "https://example.com/plain.jpg",
        userId: "user-1"
    }), /genes first/);
});

test("bulk publishing writes one batch and skips photos already in the gallery", async () => {
    const inserted = [];
    let progress = [];

    function builder() {
        const query = {
            payload: null,
            filters: {},
            mode: "select",
            eq(column, value) {
                this.filters[column] = value;
                return this;
            },
            in(column, values) {
                this.filters[column] = values;
                return this;
            },
            then(resolve) {
                if (this.mode === "select") {
                    return Promise.resolve(resolve({
                        data: [{ photo_url: "https://example.com/already.jpg" }],
                        error: null
                    }));
                }

                const rows = Array.isArray(this.payload) ? this.payload : [this.payload];

                inserted.push(rows);

                return Promise.resolve(resolve({
                    data: rows.map((row, index) => ({
                        ...row,
                        id: `row-${index}`,
                        created_at: "2026-01-01T00:00:00Z"
                    })),
                    error: null
                }));
            }
        };

        return query;
    }

    window.CloudSync = {
        _getClient: () => ({
            from: () => ({
                select() {
                    const query = builder();
                    query.mode = "select";
                    return query;
                },
                insert(payload) {
                    const query = builder();
                    query.mode = "insert";
                    query.payload = payload;
                    query.select = () => query;
                    return query;
                }
            })
        }),
        getSession: async () => ({ user: { id: "user-1" } })
    };

    try {
        const results = await gallery.publishMany({
            targets: [
                {
                    snake: { name: "A", genes: [{ name: "Pastel", copies: 1 }] },
                    photoUrl: "https://example.com/a.jpg"
                },
                {
                    snake: { name: "B", genes: [{ name: "Pastel", copies: 1 }] },
                    photoUrl: "https://example.com/already.jpg"
                },
                {
                    snake: { name: "C", genes: [{ name: "Pastel", copies: 1 }] },
                    photoUrl: "data:image/jpeg;base64,abc"
                }
            ],
            onProgress: ({ done, total }) => progress.push([done, total])
        });

        assert.equal(results[0].ok, true);
        assert.equal(results[1].ok, true);
        assert.equal(results[1].saved.alreadyPublished, undefined);
        assert.equal(results[2].ok, false);
        assert.match(results[2].error, /uploaded to your cloud storage/);

        assert.equal(inserted.length, 1);
        assert.deepEqual(Array.from(inserted[0], row => row.photo_url), ["https://example.com/a.jpg"]);
        assert.deepEqual(progress[progress.length - 1], [3, 3]);
    } finally {
        delete window.CloudSync;
        gallery.clearCache();
    }
});

test("publishing a photo that is already shared returns the existing row", async () => {
    let insertCalls = 0;

    window.CloudSync = {
        _getClient: () => ({
            from: () => ({
                select() {
                    const query = {
                        eq() {
                            return query;
                        },
                        in() {
                            return query;
                        },
                        then(resolve) {
                            return Promise.resolve(resolve({
                                data: [{ photo_url: "https://example.com/already.jpg" }],
                                error: null
                            }));
                        }
                    };

                    return query;
                },
                insert() {
                    insertCalls += 1;
                    throw new Error("should not insert a duplicate");
                }
            })
        }),
        getSession: async () => ({ user: { id: "user-1" } })
    };

    try {
        const saved = await gallery.publish({
            snake: { genes: [{ name: "Pastel", copies: 1 }] },
            photoUrl: "https://example.com/already.jpg"
        });

        assert.equal(saved.alreadyPublished, true);
        assert.equal(saved.photoUrl, "https://example.com/already.jpg");
        assert.equal(insertCalls, 0);
    } finally {
        delete window.CloudSync;
        gallery.clearCache();
    }
});

test("each photo says whether it can be published, is published, or is device-only", () => {
    const states = gallery.photoPublishStates({
        urls: [
            "https://example.com/shared.jpg",
            "https://example.com/new.jpg",
            "data:image/jpeg;base64,abc"
        ],
        genes: [{ name: "Pastel", copies: 1 }],
        publishedUrls: new Set(["https://example.com/shared.jpg"])
    });

    assert.deepEqual(
        Array.from(states, state => [
            state.url,
            state.cloud,
            state.published,
            state.canPublish,
            state.reason
        ]),
        [
            ["https://example.com/shared.jpg", true, true, false, ""],
            ["https://example.com/new.jpg", true, false, true, ""],
            ["data:image/jpeg;base64,abc", false, false, false, "On this device only"]
        ]
    );
});

test("a photo cannot be published before the snake has genes", () => {
    const [state] = gallery.photoPublishStates({
        urls: ["https://example.com/a.jpg"],
        genes: [],
        publishedUrls: []
    });

    assert.equal(state.canPublish, false);
    assert.equal(state.reason, "Add genes first");
    assert.equal(state.published, false);
});
