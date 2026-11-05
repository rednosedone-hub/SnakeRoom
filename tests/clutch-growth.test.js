const test = require("node:test");
const assert = require("node:assert/strict");

const growth = require("../clutch-growth-helpers.js");

function hatchling(overrides = {}) {
    return {
        id: "snake-1",
        name: "Nova",
        ID: "SS-C26-1-01",
        clutchId: "2026-01",
        hatchDate: "2026-07-01",
        status: "Hatchling",
        weightHistory: [
            { date: "2026-07-01", weight: 70 },
            { date: "2026-08-01", weight: 180 },
            { date: "2026-09-01", weight: 300 }
        ],
        ...overrides
    };
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

test("one weigh-in per day, later entry wins, unreadable rows are dropped", () => {
    const series = growth.seriesFor(hatchling({
        weightHistory: [
            { date: "2026-08-01", weight: 180 },
            { date: "2026-08-01", weight: 184 },
            { date: "", weight: 200 },
            { date: "2026-07-01", weight: 0 },
            { date: "bad", weight: 120 }
        ]
    }));

    assert.deepEqual(Array.from(series, point => [point.date, point.weight]), [
        ["2026-08-01", 184]
    ]);
});

test("the clutch record's hatch date wins over the hatchlings' own", () => {
    const members = [hatchling(), hatchling({ id: "snake-2", hatchDate: "2026-06-28" })];

    assert.deepEqual(
        growth.hatchDateFor(members, { id: "2026-01", hatchedDate: "2026-06-30" }),
        { date: "2026-06-30", source: "clutch" }
    );

    // A tie between hatch dates resolves to the earliest, when the clutch
    // started hatching.
    assert.deepEqual(growth.hatchDateFor(members, null), { date: "2026-06-28", source: "hatchlings" });
    assert.deepEqual(growth.hatchDateFor([hatchling({ hatchDate: "" })], null), { date: "", source: "" });
});

test("only the siblings of the chosen clutch are compared, in ID order", () => {
    const snakes = [
        hatchling({ id: "b", name: "Beta", ID: "SS-C26-1-02" }),
        hatchling({ id: "a", name: "Alpha", ID: "SS-C26-1-01" }),
        hatchling({ id: "c", name: "Alpha", ID: "SS-C26-1-10" }),
        hatchling({ id: "d", name: "Other", ID: "SS-C25-3-01", clutchId: "2025-03" }),
        hatchling({ id: "e", name: "Loose", ID: "SS-100", clutchId: "" })
    ];

    assert.deepEqual(
        Array.from(growth.clutchmates(snakes, "2026-01"), snake => snake.name),
        ["Alpha", "Beta", "Alpha"]
    );
    assert.deepEqual(Array.from(growth.clutchmates(snakes, "2026-01"), snake => snake.ID), [
        "SS-C26-1-01",
        "SS-C26-1-02",
        "SS-C26-1-10"
    ]);
    assert.equal(growth.clutchmates(snakes, "").length, 0);
});

test("a profile measures age and growth from the hatch date", () => {
    const profile = plain(growth.profileFor(hatchling(), "2026-07-01"));

    assert.equal(profile.label, "Nova");
    assert.equal(profile.weighIns, 3);
    assert.equal(profile.latest.weight, 300);
    assert.equal(profile.ageDays, 62);
    // 230 g over 62 days is 26 g/week, not 230 over the whole span as a guess.
    assert.equal(profile.ratePerWeek, 26);
    assert.deepEqual(profile.agePoints.map(point => point.age), [0, 31, 62]);
});

test("a second weigh-in days later has no rate, and unreadable dates are ignored", () => {
    const profile = growth.profileFor(hatchling({
        weightHistory: [
            { date: "2026-08-01", weight: 180 },
            { date: "2026-08-03", weight: 190 }
        ]
    }), "2026-07-01");

    assert.equal(profile.ratePerWeek, null);
    assert.equal(profile.ageDays, 33);
    assert.equal(growth.profileFor(hatchling({ weightHistory: [] }), "2026-07-01").latest, null);
    assert.deepEqual(growth.profileFor(hatchling(), "").agePoints, []);
});

test("the median ignores blanks and averages the middle pair", () => {
    assert.equal(growth.median([300, 100, 200]), 200);
    assert.equal(growth.median([100, 200, 300, 400]), 250);
    assert.equal(growth.median([250]), 250);
    assert.equal(growth.median([]), null);
    assert.equal(growth.median([null, undefined, 120]), 120);
});

test("hatchlings within 15% of the median are growing together", () => {
    const snakes = [
        hatchling({ id: "1", name: "Nova", weightHistory: [{ date: "2026-09-01", weight: 300 }] }),
        hatchling({ id: "2", name: "Atlas", weightHistory: [{ date: "2026-09-01", weight: 320 }] }),
        hatchling({ id: "3", name: "Vega", weightHistory: [{ date: "2026-09-01", weight: 280 }] })
    ];
    const result = plain(growth.compare(snakes, "2026-01"));

    assert.equal(result.comparableCount, 3);
    assert.equal(result.medianWeight, 300);
    assert.equal(result.medianAge, 62);
    assert.deepEqual(result.rows.map(row => row.label), ["Atlas", "Nova", "Vega"]);
    assert.deepEqual(result.rows.map(row => row.flag), ["on-track", "on-track", "on-track"]);
    assert.match(result.verdict, /growing together/);
});

test("a hatchling well under the median is called out as lagging", () => {
    const snakes = [
        hatchling({ id: "1", name: "Nova", weightHistory: [{ date: "2026-09-01", weight: 300 }] }),
        hatchling({ id: "2", name: "Atlas", weightHistory: [{ date: "2026-09-01", weight: 320 }] }),
        hatchling({ id: "3", name: "Dot", weightHistory: [{ date: "2026-09-01", weight: 190 }] })
    ];
    const result = plain(growth.compare(snakes, "2026-01"));

    assert.deepEqual(result.lagging.map(row => row.label), ["Dot"]);
    assert.ok(result.lagging[0].ratio < 0.85);
    assert.match(result.verdict, /Lagging: Dot/);
});

test("one very forward hatchling is reported without crying wolf", () => {
    const snakes = [
        hatchling({ id: "1", name: "Nova", weightHistory: [{ date: "2026-09-01", weight: 300 }] }),
        hatchling({ id: "2", name: "Atlas", weightHistory: [{ date: "2026-09-01", weight: 390 }] })
    ];
    const result = plain(growth.compare(snakes, "2026-01"));

    assert.deepEqual(result.ahead.map(row => row.label), ["Atlas"]);
    assert.deepEqual(result.lagging, []);
    assert.match(result.verdict, /Ahead of the clutch: Atlas/);
});

test("a clutch with one weigh-in says so instead of inventing a comparison", () => {
    const single = plain(growth.compare([hatchling()], "2026-01"));

    assert.equal(single.comparableCount, 1);
    assert.equal(single.medianWeight, 300);
    assert.match(single.verdict, /nothing to compare yet/);

    const empty = growth.compare([], "2026-01");

    assert.equal(empty.rows.length, 0);
    assert.match(empty.verdict, /No hatchlings/);
});

test("hatchlings with no weigh-in still appear, last and unmeasured", () => {
    const result = plain(growth.compare([
        hatchling({ id: "1", name: "Weighed" }),
        hatchling({ id: "2", name: "Fresh", weightHistory: [] })
    ], "2026-01"));

    assert.deepEqual(result.rows.map(row => [row.label, row.flag || "none"]), [
        ["Weighed", "none"],
        ["Fresh", "none"]
    ]);
    assert.equal(result.verdict.includes("Weighed"), true);
});

test("the axis steps by a readable amount and never cuts a point off", () => {
    assert.deepEqual(growth.axisRange([70, 300]), { min: 25, max: 350 });
    assert.deepEqual(growth.axisRange([70, 90]), { min: 65, max: 95 });
    assert.ok(growth.axisRange([200, 1400]).max >= 1400);
    assert.deepEqual(growth.axisRange([]), { min: 0, max: 10 });
});

test("every hatchling shares one age axis, with age-day ticks", () => {
    const result = growth.compare([
        hatchling({ id: "1", name: "Slow", weightHistory: [{ date: "2026-07-01", weight: 70 }, { date: "2026-09-01", weight: 200 }] }),
        hatchling({ id: "2", name: "Fast", weightHistory: [{ date: "2026-08-30", weight: 320 }, { date: "2026-09-01", weight: 330 }] })
    ], "2026-01", {});
    const laidOut = plain(growth.layout(result.rows, { width: 460, height: 240, padding: 40 }));

    assert.equal(laidOut.series.length, 2);
    assert.equal(laidOut.maxAge, 62);
    // Day 0 sits on the left frame edge, the oldest weigh-in on the right.
    assert.equal(laidOut.series[1].points[0].x, 40);
    assert.equal(laidOut.series[1].points[1].x, 420);
    assert.deepEqual(laidOut.ticks.map(tick => tick.label), ["0d", "21d", "41d", "62d"]);
    laidOut.series.forEach(series => {
        series.points.forEach(point => {
            assert.ok(point.y >= 40 && point.y <= 200);
            assert.ok(point.x >= 40 && point.x <= 420);
        });
    });
    // Fast (330 g) is the first row and sits higher than Slow (200 g).
    assert.equal(laidOut.series[0].label, "Fast");
    assert.ok(laidOut.series[0].points[1].y < laidOut.series[1].points[1].y);
});

test("a weigh-in dated before hatching is not plotted", () => {
    const profile = growth.profileFor(hatchling({
        weightHistory: [
            { date: "2026-06-20", weight: 60 },
            { date: "2026-08-01", weight: 180 }
        ]
    }), "2026-07-01");

    assert.deepEqual(profile.agePoints.map(point => point.age), [31]);
    assert.equal(profile.latest.weight, 180);
});

test("with no dates there is no chart, but the rows still exist", () => {
    const result = growth.compare([
        hatchling({ hatchDate: "", weightHistory: [{ date: "2026-09-01", weight: 300 }] })
    ], "2026-01");

    assert.equal(result.hatchDate, "");
    assert.equal(result.rows.length, 1);
    assert.deepEqual(growth.layout(result.rows).series, []);
});
