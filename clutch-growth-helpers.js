// Clutch growth: compare the hatchlings of one clutch to each other.
//
// Calendar dates are the wrong axis for siblings: one may have been weighed on
// a different day, and a clutch hatched over a week makes the later ones look
// small. Everything here is measured from the hatch date instead, so "growing
// in a similar fashion" is a fair question.
//
// Pure functions only: the page draws the SVG.

(function () {
    const DAY_MS = 1000 * 60 * 60 * 24;
    const MIN_RATE_SPAN_DAYS = 5;
    // A hatchling within 15% of the clutch median is growing with the rest.
    const LAG_RATIO = 0.85;
    const AHEAD_RATIO = 1.15;
    const LAG_PERCENT = 15;

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

        if (
            date.getFullYear() !== parts[0] ||
            date.getMonth() !== parts[1] - 1 ||
            date.getDate() !== parts[2]
        ) {
            return null;
        }

        return date;
    }

    function dateText(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function daysBetween(fromValue, toValue) {
        const from = parseDate(fromValue);
        const to = parseDate(toValue);

        if (!from || !to) {
            return null;
        }

        return Math.round((to.getTime() - from.getTime()) / DAY_MS);
    }

    function snakeLabel(snake) {
        return text(snake && (snake.name || snake.ID)) || "Unnamed";
    }

    // One weigh-in per day: the later entry wins, the same rule the growth
    // chart uses, so two pages never disagree about a day's weight.
    function seriesFor(snake) {
        const byDate = new Map();

        (Array.isArray(snake && snake.weightHistory) ? snake.weightHistory : []).forEach(entry => {
            if (!entry || typeof entry !== "object") {
                return;
            }

            const date = parseDate(entry.date);

            if (!date) {
                return;
            }

            const weight = Number(entry.weight ?? entry.value);

            if (!Number.isFinite(weight) || weight <= 0) {
                return;
            }

            byDate.set(dateText(date), {
                date: dateText(date),
                time: date.getTime(),
                weight: Math.round(weight * 10) / 10
            });
        });

        return [...byDate.values()].sort((left, right) => left.time - right.time);
    }

    function clutchmates(snakes, clutchId) {
        const wanted = text(clutchId);

        if (!wanted) {
            return [];
        }

        return (Array.isArray(snakes) ? snakes : [])
            .filter(snake => snake && text(snake.clutchId) === wanted)
            .sort((left, right) =>
                String(left.ID || "").localeCompare(String(right.ID || ""), undefined, { numeric: true })
                || snakeLabel(left).localeCompare(snakeLabel(right))
            );
    }

    // The clutch record owns the hatch date. Older or imported hatchling
    // records may only carry their own date, so the most common one among the
    // siblings is the next best answer.
    function hatchDateFor(members, clutch) {
        const clutchDate = text(clutch && (clutch.hatchedDate || clutch.hatchDate)).slice(0, 10);

        if (parseDate(clutchDate)) {
            return { date: clutchDate, source: "clutch" };
        }

        const counts = new Map();

        (Array.isArray(members) ? members : []).forEach(snake => {
            const value = text(snake && (snake.hatchDate || snake.hatchedDate)).slice(0, 10);

            if (parseDate(value)) {
                counts.set(value, (counts.get(value) || 0) + 1);
            }
        });

        if (counts.size === 0) {
            return { date: "", source: "" };
        }

        const best = [...counts.entries()].sort((left, right) =>
            right[1] - left[1] || left[0].localeCompare(right[0])
        )[0];

        return { date: best[0], source: "hatchlings" };
    }

    function median(values) {
        const list = (Array.isArray(values) ? values : [])
            .filter(value => value !== null && value !== undefined && value !== "")
            .map(Number)
            .filter(value => Number.isFinite(value))
            .sort((left, right) => left - right);

        if (list.length === 0) {
            return null;
        }

        const middle = Math.floor(list.length / 2);

        return list.length % 2 === 0
            ? Math.round(((list[middle - 1] + list[middle]) / 2) * 10) / 10
            : list[middle];
    }

    // How one hatchling sits on its own curve: latest weight, age that day,
    // and the average gain per week since its first weigh-in.
    function profileFor(snake, hatchDate) {
        const series = seriesFor(snake);
        const latest = series.length > 0 ? series[series.length - 1] : null;
        const first = series.length > 0 ? series[0] : null;
        const ageDays = latest ? daysBetween(hatchDate, latest.date) : null;
        let ratePerWeek = null;

        if (first && latest && first !== latest) {
            const span = daysBetween(first.date, latest.date);

            if (span !== null && span >= MIN_RATE_SPAN_DAYS) {
                ratePerWeek = Math.round(((latest.weight - first.weight) / span) * 7 * 10) / 10;
            }
        }

        return {
            id: text(snake && snake.id),
            label: snakeLabel(snake),
            ID: text(snake && snake.ID),
            series,
            first,
            latest,
            weighIns: series.length,
            ageDays: Number.isFinite(ageDays) ? ageDays : null,
            ratePerWeek,
            status: text(snake && snake.status),
            // Age-aligned points for the chart; a hatchling with no hatch date
            // still keeps its real series for the table.
            agePoints: series
                .map(point => {
                    const age = daysBetween(hatchDate, point.date);

                    // A weight dated before the hatch date is a typo, not a
                    // growth point, so it is left out of the age chart.
                    return age === null || age < 0
                        ? null
                        : { age, time: point.time, date: point.date, weight: point.weight };
                })
                .filter(Boolean)
        };
    }

    function sortRows(rows) {
        return rows.slice().sort((left, right) => {
            const leftWeight = left.latest ? left.latest.weight : -1;
            const rightWeight = right.latest ? right.latest.weight : -1;

            return rightWeight - leftWeight || left.label.localeCompare(right.label);
        });
    }

    function ratioText(ratio) {
        return `${Math.round(ratio * 100)}% of median`;
    }

    // The whole comparison for one clutch: rows in heaviest-first order, the
    // median the flags are measured against, and a sentence a keeper can act on.
    function compare(snakes, clutchId, options = {}) {
        const members = clutchmates(snakes, clutchId);
        const hatch = hatchDateFor(members, options.clutch || null);
        const rows = sortRows(members.map(snake => profileFor(snake, hatch.date)));
        const weighed = rows.filter(row => row.latest);
        const medianWeight = median(weighed.map(row => row.latest.weight));
        const medianAge = median(weighed.map(row => row.ageDays).filter(age => age !== null));
        const weights = weighed.map(row => row.latest.weight);
        const spreadPercent = medianWeight && weights.length > 1
            ? Math.round(((Math.max(...weights) - Math.min(...weights)) / medianWeight) * 100)
            : null;

        const lagging = [];
        const ahead = [];

        if (medianWeight && weighed.length > 1) {
            // With two animals the median always sits between them, so neither
            // can clear 15%. The heaviest is also measured against the next
            // heaviest, which catches a single fast grower in a small clutch.
            const descending = weighed.map(row => row.latest.weight).sort((left, right) => right - left);
            const runnerUp = descending.length > 1 ? descending[1] : null;

            weighed.forEach(row => {
                const ratio = row.latest.weight / medianWeight;
                const leadsClutch = row.latest.weight === descending[0]
                    && runnerUp
                    && row.latest.weight / runnerUp > AHEAD_RATIO;

                row.ratio = ratio;

                if (ratio < LAG_RATIO) {
                    row.flag = "lagging";
                    lagging.push({ ...row, ratio });
                } else if (ratio > AHEAD_RATIO || leadsClutch) {
                    row.flag = "ahead";
                    ahead.push({ ...row, ratio });
                } else {
                    row.flag = "on-track";
                }
            });
        }

        return {
            clutchId: text(clutchId),
            hatchDate: hatch.date,
            hatchSource: hatch.source,
            rows,
            comparableCount: weighed.length,
            medianWeight,
            medianAge,
            spreadPercent,
            lagging,
            ahead,
            verdict: buildVerdict({
                rows,
                weighed,
                medianWeight,
                medianAge,
                spreadPercent,
                lagging,
                ahead
            })
        };
    }

    function buildVerdict(summary) {
        const { rows, weighed, medianWeight, medianAge, spreadPercent, lagging, ahead } = summary;
        const count = rows.length;

        if (count === 0) {
            return "No hatchlings are linked to this clutch yet.";
        }

        if (weighed.length === 0) {
            return `${count} hatchling${count === 1 ? " is" : "s are"} on record, but none has a weigh-in yet.`;
        }

        if (weighed.length === 1) {
            return `Only ${weighed[0].label} has a weigh-in, so there is nothing to compare yet. Weigh the rest of the clutch.`;
        }

        const ageText = medianAge !== null && medianAge >= 0
            ? ` at a median age of ${Math.round(medianAge)} day${Math.round(medianAge) === 1 ? "" : "s"}`
            : "";
        const spreadText = spreadPercent !== null
            ? ` The spread is ${spreadPercent}% around a median of ${medianWeight} g.`
            : "";

        if (lagging.length > 0) {
            const names = lagging.map(row => `${row.label} (${ratioText(row.ratio)})`).join(", ");

            return `${weighed.length} of ${count} hatchlings have weigh-ins${ageText}.${spreadText} Lagging: ${names}. Check feeding, temps and the last shed on those.`;
        }

        if (ahead.length > 0 && lagging.length === 0) {
            const names = ahead.map(row => `${row.label} (${ratioText(row.ratio)})`).join(", ");

            return `${weighed.length} of ${count} hatchlings have weigh-ins${ageText}.${spreadText} Ahead of the clutch: ${names}; nothing is lagging.`;
        }

        return `${weighed.length} of ${count} hatchlings have weigh-ins${ageText}.${spreadText} All of them are within ${LAG_PERCENT}% of the clutch median, so they are growing together.`;
    }

    // A stepped axis keeps hatchling weights readable: 5 g steps up to 60 g of
    // spread, 10 g up to 200 g, then 25 g.
    function axisRange(values) {
        const list = (Array.isArray(values) ? values : []).filter(value => Number.isFinite(value));

        if (list.length === 0) {
            return { min: 0, max: 10 };
        }

        const lowest = Math.min(...list);
        const highest = Math.max(...list);
        const pad = Math.max(2, (highest - lowest) * 0.12);
        const floor = Math.max(0, lowest - pad);
        const ceiling = highest + pad;
        const span = Math.max(1, ceiling - floor);
        const step = span <= 60 ? 5 : span <= 200 ? 10 : 25;

        return {
            min: Math.max(0, Math.floor(floor / step) * step),
            max: Math.ceil(ceiling / step) * step
        };
    }

    function tickLabels(maxAge) {
        const steps = [0, 1, 2, 3];
        const ages = steps.map(step => Math.round((maxAge * step) / 3));

        // Keep the labels unique even for a very short window.
        return ages
            .filter((age, index) => ages.indexOf(age) === index)
            .map(age => ({ age, label: `${age}d` }));
    }

    // Lay every hatchling's curve on one frame: x is days since hatching, y is
    // grams. Every sibling is read against the same axes.
    function layout(rows, options = {}) {
        const width = Number(options.width) || 460;
        const height = Number(options.height) || 240;
        const padding = Number(options.padding) || 40;
        const usable = (Array.isArray(rows) ? rows : [])
            .filter(row => row && Array.isArray(row.agePoints) && row.agePoints.length > 0);
        const allPoints = usable.flatMap(row => row.agePoints);

        if (allPoints.length === 0) {
            return { series: [], ticks: [], width, height, padding, min: 0, max: 0, maxAge: 0 };
        }

        const maxAge = Math.max(1, ...allPoints.map(point => point.age));
        const range = axisRange(allPoints.map(point => point.weight));
        const innerWidth = width - padding * 2;
        const innerHeight = height - padding * 2;
        const spanGrams = Math.max(1, range.max - range.min);

        const series = usable.map(row => ({
            id: row.id,
            label: row.label,
            points: row.agePoints.map(point => ({
                ...point,
                x: padding + (point.age / maxAge) * innerWidth,
                y: height - padding - ((point.weight - range.min) / spanGrams) * innerHeight
            }))
        }));
        const ticks = tickLabels(maxAge).map(tick => ({
            ...tick,
            x: padding + (tick.age / maxAge) * innerWidth
        }));

        return {
            series,
            ticks,
            width,
            height,
            padding,
            min: range.min,
            max: range.max,
            maxAge
        };
    }

    const api = {
        DAY_MS,
        MIN_RATE_SPAN_DAYS,
        LAG_RATIO,
        AHEAD_RATIO,
        LAG_PERCENT,
        parseDate,
        dateText,
        daysBetween,
        seriesFor,
        clutchmates,
        hatchDateFor,
        median,
        profileFor,
        compare,
        axisRange,
        layout
    };

    if (typeof window !== "undefined") {
        window.ClutchGrowth = api;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
