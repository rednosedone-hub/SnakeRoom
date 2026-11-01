// incubation-helpers.js
// The six to eight weeks between "eggs laid" and "hatched".
//
// A clutch used to be a laid date, an egg count, and then nothing until the
// hatchlings were typed in. This module is the maths behind the incubation
// panel and its calendar reminder: how long until the eggs hatch, what the
// candling log says, and how the hatch actually turned out.
//
// It is deliberately free of DOM code so the rules can be tested, and it keeps
// its own date helpers so the outcomes page needs one script rather than a
// second dependency.

(function () {
    const DEFAULT_DAYS = 55;
    // Incubation length is set by temperature, so it is a per-clutch number. The
    // range is wide enough for a cool corner of the incubator and a warm one,
    // and anything outside it is a typo, not a plan.
    const MIN_DAYS = 40;
    const MAX_DAYS = 100;
    // Candling around three weeks in shows veins clearly while leaving the egg
    // alone for the rest of the term.
    const CANDLE_DAY = 21;

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function number(value, fallback) {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : fallback;
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

    function addDays(value, days) {
        const date = parseDate(value);

        if (!date) {
            return "";
        }

        date.setDate(date.getDate() + Number(days || 0));

        return dateText(date);
    }

    function daysBetween(fromValue, toValue) {
        const from = parseDate(fromValue);
        const to = parseDate(toValue);

        if (!from || !to) {
            return null;
        }

        return Math.round((to - from) / (1000 * 60 * 60 * 24));
    }

    function incubationDays(clutch) {
        const days = Math.round(number(clutch && clutch.incubationDays, DEFAULT_DAYS));

        return days >= MIN_DAYS && days <= MAX_DAYS ? days : DEFAULT_DAYS;
    }

    // One due date for the whole app: the outcomes panel, the calendar and any
    // future report all ask here rather than adding 55 days themselves.
    function expectedHatchDate(clutch) {
        return addDays(clutch && clutch.laidDate, incubationDays(clutch));
    }

    function pipDate(clutch) {
        const value = text(clutch && clutch.pipDate).slice(0, 10);

        return parseDate(value) ? value : "";
    }

    function countOrBlank(value) {
        if (value === "" || value === null || value === undefined) {
            return "";
        }

        const count = Math.round(number(value, -1));

        return count >= 0 ? count : "";
    }

    function candleEntry(entry) {
        if (!entry) {
            return null;
        }

        const date = text(entry.date).slice(0, 10);

        if (!parseDate(date)) {
            return null;
        }

        const fertile = countOrBlank(entry.fertile);
        const slugs = countOrBlank(entry.slugs);
        const note = text(entry.note).slice(0, 200);

        // A date on its own says nothing was counted, so it is not a record.
        if (fertile === "" && slugs === "" && !note) {
            return null;
        }

        return { date, fertile, slugs, note };
    }

    function candleLog(clutch) {
        const list = Array.isArray(clutch && clutch.candleLog) ? clutch.candleLog : [];

        return list
            .map(candleEntry)
            .filter(Boolean)
            .sort((left, right) => left.date.localeCompare(right.date));
    }

    function latestCandle(clutch) {
        const log = candleLog(clutch);

        return log.length > 0 ? log[log.length - 1] : null;
    }

    // Counts are not added up across candlings: the second look replaces the
    // first, the same way a keeper would describe the clutch.
    function candlingSummary(clutch) {
        const eggs = Math.max(0, Math.round(number(clutch && clutch.eggCount, 0)));
        const latest = latestCandle(clutch);

        if (!latest) {
            return { eggs, candled: null, fertile: null, slugs: null, date: "" };
        }

        const fertile = latest.fertile === "" ? null : latest.fertile;
        const slugs = latest.slugs === "" ? null : latest.slugs;
        const candled = (fertile || 0) + (slugs || 0);

        return {
            eggs,
            candled: candled > 0 ? candled : null,
            fertile,
            slugs,
            date: latest.date
        };
    }

    // One egg can hold twins, and a keeper counting hatchlings out of the
    // incubator knows the number before typing names. An explicit count wins,
    // then the latest candling, then the eggs on record.
    const MAX_HATCHLINGS = 60;

    function expectedHatchlingCount(clutch) {
        if (!clutch) {
            return 0;
        }

        const explicit = countOrBlank(clutch.expectedHatchlings);

        if (explicit !== "") {
            return Math.min(MAX_HATCHLINGS, explicit);
        }

        const summary = candlingSummary(clutch);

        if (summary.fertile !== null && summary.fertile > 0) {
            return Math.min(MAX_HATCHLINGS, summary.fertile);
        }

        return Math.min(MAX_HATCHLINGS, Math.max(0, Math.round(number(clutch.eggCount, 0))));
    }

    function candleDueDate(clutch) {
        return addDays(clutch && clutch.laidDate, CANDLE_DAY);
    }

    // Where the clutch is today. "due" is the due date itself, "overdue" means
    // the eggs should have pipped and someone needs to open the incubator.
    function status(clutch, todayValue) {
        const today = text(todayValue).slice(0, 10) || dateText(new Date());
        const laidDate = text(clutch && clutch.laidDate).slice(0, 10);

        if (!parseDate(laidDate)) {
            return { stage: "unlaid", day: null, dueDate: "", daysToHatch: null, pipDate: "" };
        }

        const pip = pipDate(clutch);

        if ((clutch && clutch.convertedToSnakes) || parseDate(clutch && clutch.hatchedDate)) {
            return {
                stage: "hatched",
                day: daysBetween(laidDate, clutch.hatchedDate),
                dueDate: expectedHatchDate(clutch),
                daysToHatch: daysBetween(today, expectedHatchDate(clutch)),
                pipDate: pip
            };
        }

        const dueDate = expectedHatchDate(clutch);
        const daysToHatch = daysBetween(today, dueDate);

        return {
            stage: pip ? "pipped" : (daysToHatch < 0 ? "overdue" : (daysToHatch === 0 ? "due" : "incubating")),
            day: daysBetween(laidDate, today),
            dueDate,
            daysToHatch,
            pipDate: pip
        };
    }

    function hatchStats(clutch) {
        const eggs = Math.max(0, Math.round(number(clutch && clutch.eggCount, 0)));
        const hatched = Math.max(0, Math.round(number(clutch && clutch.hatchlingCount, 0)));

        return {
            eggs,
            hatched,
            percent: eggs > 0 ? Math.round((hatched / eggs) * 100) : null
        };
    }

    // How long the eggs were actually incubated, which is what a next season
    // wants to know when deciding the thermostat setting.
    function incubatedDays(clutch) {
        const laid = text(clutch && clutch.laidDate).slice(0, 10);
        const hatched = text(clutch && clutch.hatchedDate).slice(0, 10);

        return daysBetween(laid, hatched);
    }

    window.Incubation = {
        DEFAULT_DAYS,
        MIN_DAYS,
        MAX_DAYS,
        CANDLE_DAY,
        MAX_HATCHLINGS,
        parseDate,
        dateText,
        addDays,
        daysBetween,
        incubationDays,
        expectedHatchDate,
        pipDate,
        candleEntry,
        candleLog,
        latestCandle,
        candlingSummary,
        expectedHatchlingCount,
        candleDueDate,
        status,
        hatchStats,
        incubatedDays
    };
})();
