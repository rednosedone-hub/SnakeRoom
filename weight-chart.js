// weight-chart.js
// The maths behind the growth chart on a snake record.
//
// The old chart spaced every point evenly by index, so three weigh-ins in one
// week looked the same as three spread across a year, and the axis was the raw
// minimum and maximum, so a 3 g fluctuation filled the whole box. This module
// puts points where their dates belong, rounds the axis to sensible grams, and
// reports the growth rate a keeper actually reads ("+12 g/week").
//
// Pure functions only: the page draws the SVG.

(function () {
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const DAY_MS = 1000 * 60 * 60 * 24;

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function parseDate(value) {
        const clean = text(value).slice(0, 10);
        const parts = clean.split("-").map(Number);

        if (parts.length !== 3 || parts.some(part => Number.isNaN(part))) {
            return null;
        }

        const date = new Date(parts[0], parts[1] - 1, parts[2]);

        if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) {
            return null;
        }

        return date;
    }

    function dateText(date) {
        // A Date from another frame still answers getTime; instanceof does not.
        if (!date || typeof date.getTime !== "function" || Number.isNaN(date.getTime())) {
            return "";
        }

        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    // A stored weight may be a number, a numeric string, or an old record with
    // the value under another name. Anything unreadable is not a data point.
    function normalizeEntry(entry) {
        if (entry === null || entry === undefined) {
            return null;
        }

        const isObject = typeof entry === "object";
        const date = parseDate(isObject ? entry.date || entry.day || entry.label : "");
        const weight = Number(isObject ? entry.weight ?? entry.value ?? entry.result : entry);

        if (!date || !Number.isFinite(weight) || weight <= 0) {
            return null;
        }

        return { date: dateText(date), time: date.getTime(), weight };
    }

    // Two weigh-ins on the same day collapse to one point: the later entry in
    // the list wins, which is the one the keeper added last.
    function buildSeries(history) {
        const byDate = new Map();

        (Array.isArray(history) ? history : []).forEach(entry => {
            const point = normalizeEntry(entry);

            if (point) {
                byDate.set(point.date, point);
            }
        });

        return [...byDate.values()].sort((left, right) => left.time - right.time);
    }

    function growthSummary(series) {
        if (!Array.isArray(series) || series.length < 2) {
            return null;
        }

        const first = series[0];
        const last = series[series.length - 1];
        const days = Math.round((last.time - first.time) / DAY_MS);

        if (days <= 0) {
            return null;
        }

        const gain = last.weight - first.weight;

        return {
            firstWeight: first.weight,
            lastWeight: last.weight,
            firstDate: first.date,
            lastDate: last.date,
            days,
            gain,
            gramsPerWeek: Math.round((gain / days) * 7 * 10) / 10
        };
    }

    // Pad the range so a line never sits on the frame, then round outwards to
    // 5 g stops: an axis reading 835 / 905 is easier to trust than 837.4.
    function axisRange(values) {
        const list = (Array.isArray(values) ? values : []).filter(value => Number.isFinite(value));

        if (list.length === 0) {
            return { min: 0, max: 1 };
        }

        let min = Math.min(...list);
        let max = Math.max(...list);

        if (min === max) {
            const spread = Math.max(5, min * 0.05);

            return {
                min: Math.max(0, Math.floor((min - spread) / 5) * 5),
                max: Math.ceil((max + spread) / 5) * 5
            };
        }

        const pad = Math.max(2, (max - min) * 0.12);

        return {
            min: Math.max(0, Math.floor((min - pad) / 5) * 5),
            max: Math.ceil((max + pad) / 5) * 5
        };
    }

    function shortDate(value) {
        const date = parseDate(value);

        return date ? `${date.getDate()} ${MONTHS[date.getMonth()]}` : "";
    }

    function pickTicks(series, points, maxTicks) {
        const count = Math.min(Math.max(1, maxTicks), series.length);
        const indexes = new Set();

        if (count === 1) {
            indexes.add(0);
        } else {
            for (let index = 0; index < count; index += 1) {
                indexes.add(Math.round((index * (series.length - 1)) / (count - 1)));
            }
        }

        return [...indexes]
            .sort((left, right) => left - right)
            .map(index => ({
                x: points[index].x,
                date: series[index].date,
                label: shortDate(series[index].date)
            }));
    }

    function layout(series, options = {}) {
        const list = Array.isArray(series) ? series : [];
        const width = Number(options.width) || 440;
        const height = Number(options.height) || 180;
        const padding = Number(options.padding) || 34;

        if (list.length === 0) {
            return { points: [], ticks: [], width, height, padding, min: 0, max: 0 };
        }

        const range = axisRange(list.map(item => item.weight));
        const innerWidth = width - padding * 2;
        const innerHeight = height - padding * 2;
        const firstTime = list[0].time;
        const span = list[list.length - 1].time - firstTime;
        const spanGrams = Math.max(1, range.max - range.min);

        const points = list.map(item => ({
            ...item,
            x: span > 0 ? padding + ((item.time - firstTime) / span) * innerWidth : padding + innerWidth / 2,
            y: height - padding - ((item.weight - range.min) / spanGrams) * innerHeight
        }));

        return {
            points,
            ticks: pickTicks(list, points, options.maxTicks || 4),
            width,
            height,
            padding,
            min: range.min,
            max: range.max
        };
    }

    window.WeightChart = {
        parseDate,
        dateText,
        normalizeEntry,
        buildSeries,
        growthSummary,
        axisRange,
        shortDate,
        layout
    };
})();
