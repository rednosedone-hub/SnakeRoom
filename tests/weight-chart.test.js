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
    fs.readFileSync(path.join(projectRoot, "weight-chart.js"), "utf8"),
    context,
    { filename: "weight-chart.js" }
);

const chart = context.window.WeightChart;

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

test("unreadable weigh-ins are dropped and the rest are sorted by date", () => {
    const series = chart.buildSeries([
        { date: "2026-05-01", weight: "820" },
        { date: "", weight: 400 },
        { date: "2026-03-01", weight: 0 },
        { date: "2026-04-01", value: 780 },
        null,
        { date: "not a date", weight: 800 },
        { date: "2026-02-01", weight: 760 }
    ]);

    assert.deepEqual(Array.from(series, point => [point.date, point.weight]), [
        ["2026-02-01", 760],
        ["2026-04-01", 780],
        ["2026-05-01", 820]
    ]);
});

test("two weigh-ins on one day collapse to the later one", () => {
    const series = chart.buildSeries([
        { date: "2026-05-01", weight: 800 },
        { date: "2026-05-01", weight: 812 }
    ]);

    assert.equal(series.length, 1);
    assert.equal(series[0].weight, 812);
});

test("growth is reported per week over the real dates", () => {
    const series = chart.buildSeries([
        { date: "2026-09-01", weight: 600 },
        { date: "2026-09-15", weight: 624 },
        { date: "2026-10-13", weight: 672 }
    ]);
    const growth = plain(chart.growthSummary(series));

    assert.deepEqual(growth, {
        firstWeight: 600,
        lastWeight: 672,
        firstDate: "2026-09-01",
        lastDate: "2026-10-13",
        days: 42,
        gain: 72,
        gramsPerWeek: 12
    });
});

test("a single weigh-in has no growth rate and a loss is negative", () => {
    assert.equal(chart.growthSummary(chart.buildSeries([{ date: "2026-05-01", weight: 800 }])), null);
    assert.equal(chart.growthSummary([]), null);

    const growth = chart.growthSummary(chart.buildSeries([
        { date: "2026-09-01", weight: 700 },
        { date: "2026-09-08", weight: 686 }
    ]));

    assert.equal(growth.gramsPerWeek, -14);
});

test("the axis is padded and rounded to 5 g stops", () => {
    assert.deepEqual(plain(chart.axisRange([600, 672])), { min: 590, max: 685 });
    // One value still gets room to breathe rather than a zero-height chart.
    assert.deepEqual(plain(chart.axisRange([800])), { min: 760, max: 840 });
    assert.deepEqual(plain(chart.axisRange([])), { min: 0, max: 1 });
    assert.equal(chart.axisRange([3]).min, 0);
});

test("points sit where their dates belong, not evenly by index", () => {
    const series = chart.buildSeries([
        { date: "2026-09-01", weight: 600 },
        { date: "2026-09-02", weight: 605 },
        { date: "2026-11-01", weight: 700 }
    ]);
    const laidOut = plain(chart.layout(series, { width: 440, height: 180, padding: 34 }));

    assert.equal(laidOut.points.length, 3);
    assert.equal(laidOut.points[0].x, 34);
    assert.equal(laidOut.points[2].x, 406);
    // The second point is one thirtieth of the way along, not halfway.
    assert.ok(laidOut.points[1].x < 50);
    // A heavier snake sits higher, and every point stays inside the frame.
    assert.ok(laidOut.points[0].y > laidOut.points[2].y);
    laidOut.points.forEach(point => {
        assert.ok(point.y >= 34 && point.y <= 146);
    });
});

test("a chosen window keeps only the weigh-ins inside it", () => {
    const series = chart.buildSeries([
        { date: "2026-08-15", weight: 640 },
        { date: "2026-09-01", weight: 660 },
        { date: "2026-09-20", weight: 685 },
        { date: "2026-10-05", weight: 712 }
    ]);

    assert.deepEqual(
        Array.from(chart.filterSeries(series, { from: "2026-09-01", to: "2026-10-05" }), point => point.date),
        ["2026-09-01", "2026-09-20", "2026-10-05"]
    );
    // An open side means "no limit", and no range at all keeps everything.
    assert.equal(chart.filterSeries(series, { from: "2026-09-20" }).length, 2);
    assert.equal(chart.filterSeries(series, { to: "2026-09-01" }).length, 2);
    assert.equal(chart.filterSeries(series, {}).length, 4);
    assert.equal(chart.filterSeries(series, { from: "bad", to: "also bad" }).length, 4);
    assert.deepEqual(Array.from(chart.filterSeries(series, { from: "2027-01-01" })), []);
});

test("a custom window shows the quiet weeks at its edges", () => {
    const series = chart.buildSeries([
        { date: "2026-09-01", weight: 660 },
        { date: "2026-10-01", weight: 700 }
    ]);
    const times = plain(chart.rangeTimes({ from: "2026-08-01", to: "2026-11-01" }));
    const laidOut = plain(chart.layout(series, {
        width: 440,
        height: 180,
        padding: 34,
        startTime: times.startTime,
        endTime: times.endTime
    }));

    // September and October sit inside an August-to-November window, so neither
    // point is pinned to the frame.
    assert.ok(laidOut.points[0].x > 34);
    assert.ok(laidOut.points[1].x < 406);
    assert.ok(laidOut.points[1].x > laidOut.points[0].x);
    // Roughly a third of the way in for 1 September: 31 of 92 days.
    assert.ok(Math.abs(laidOut.points[0].x - 159) < 3);
});

test("a single point is centred, and labels never overlap", () => {
    const single = chart.layout(chart.buildSeries([{ date: "2026-05-01", weight: 800 }]), { width: 440, padding: 34 });

    assert.deepEqual(Array.from(single.points, point => point.x), [220]);
    assert.deepEqual(Array.from(single.ticks, tick => tick.label), ["1 May"]);

    const many = chart.layout(chart.buildSeries(
        Array.from({ length: 12 }, (_, index) => ({
            date: chart.dateText(new Date(2026, 0, 1 + index * 7)),
            weight: 500 + index * 10
        }))
    ), { maxTicks: 4 });

    assert.ok(many.ticks.length <= 4);
    assert.equal(many.ticks[0].label, chart.shortDate(many.ticks[0].date));
});

test("a comparison series shares the axis and can outgrow the primary", () => {
    const primary = chart.buildSeries([
        { date: "2026-09-01", weight: 600 },
        { date: "2026-10-01", weight: 700 }
    ]);
    const secondary = chart.buildSeries([
        { date: "2026-09-01", weight: 800 },
        { date: "2026-10-01", weight: 900 }
    ]);
    const laidOut = plain(chart.layout(primary, { width: 440, height: 180, padding: 34, secondary }));

    assert.equal(laidOut.secondaryPoints.length, 2);
    // The axis covers both animals, not just the one being edited.
    assert.ok(laidOut.max >= 900);
    assert.ok(laidOut.min <= 600);
    // Same dates mean the points line up horizontally.
    assert.equal(laidOut.secondaryPoints[0].x, laidOut.points[0].x);
    assert.equal(laidOut.points[0].x, 34);
    // The heavier comparison sits higher on the chart.
    assert.ok(laidOut.secondaryPoints[0].y < laidOut.points[0].y);
});

test("last season shifts onto this season's dates but keeps the real one", () => {
    const series = chart.buildSeries([
        { date: "2025-09-10", weight: 820 },
        { date: "2025-10-10", weight: 860 }
    ]);
    const shifted = plain(chart.shiftSeries(series, 364));

    assert.equal(shifted[0].date, "2026-09-09");
    assert.equal(shifted[0].originalDate, "2025-09-10");
    assert.ok(shifted[0].time > series[0].time);

    const inWindow = chart.filterSeries(chart.shiftSeries(series, 364), { from: "2026-09-01", to: "2026-10-31" });

    assert.equal(inWindow.length, 2);
    // This season's own points shift into next year and fall outside.
    assert.equal(chart.filterSeries(chart.shiftSeries(series, 364), { from: "2027-01-01" }).length, 0);
});

test("a short date reads the way a keeper would say it", () => {
    assert.equal(chart.shortDate("2026-11-14"), "14 Nov");
    assert.equal(chart.shortDate("bad"), "");
});
