// breeding-timeline.js
// The weeks between a pairing and eggs, estimated from what a keeper can
// actually see: the pre-lay shed (the reliable anchor) and the weight climb
// that goes with follicular development.
//
// A ball python usually ovulates about 18 days before her pre-lay shed and
// lays roughly 28 days after it. Those are the middle of the ranges the
// calendar shows (14-24 days before the shed, 21-35 days after), so a single
// date still reads as an estimate rather than a promise. The weight climb is
// kept as supporting evidence, which is why it changes the confidence and the
// detail line but not the arithmetic.

(function () {
    const OVULATION_DAYS_BEFORE_SHED = 18;
    const OVULATION_WINDOW = [14, 24];
    const LAY_DAYS_AFTER_SHED = 28;
    const LAY_WINDOW = [21, 35];
    const CLIMB_WINDOW_DAYS = 56;
    const MIN_CLIMB_SPAN_DAYS = 14;
    const MIN_CLIMB_GRAMS = 25;
    const MIN_CLIMB_PERCENT = 1.5;
    // Matches Incubation.DEFAULT_DAYS (and its accepted range) so a printed
    // hatch date cannot drift from the one the outcomes page shows.
    const DEFAULT_INCUBATION_DAYS = 55;
    const MIN_INCUBATION_DAYS = 40;
    const MAX_INCUBATION_DAYS = 100;

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
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
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

    // The climb a keeper would point at when asked why she looks ready: a rise
    // over at least a fortnight in the two months before the pre-lay shed.
    function weightClimb(female, shedDate) {
        const history = (Array.isArray(female && female.weightHistory) ? female.weightHistory : [])
            .map(entry => ({
                date: text(entry && entry.date).slice(0, 10),
                weight: Number(entry && entry.weight)
            }))
            .filter(entry => parseDate(entry.date) && Number.isFinite(entry.weight) && entry.weight > 0)
            .sort((left, right) => left.date.localeCompare(right.date));
        const start = addDays(shedDate, -CLIMB_WINDOW_DAYS);
        const points = history.filter(entry => entry.date >= start && entry.date <= shedDate);

        if (points.length < 2) {
            return null;
        }

        const first = points[0];
        const last = points[points.length - 1];
        const days = daysBetween(first.date, last.date);

        if (!days || days < MIN_CLIMB_SPAN_DAYS) {
            return null;
        }

        const gain = last.weight - first.weight;
        const threshold = Math.max(MIN_CLIMB_GRAMS, first.weight * (MIN_CLIMB_PERCENT / 100));

        if (gain < threshold) {
            return null;
        }

        return {
            firstDate: first.date,
            lastDate: last.date,
            firstWeight: first.weight,
            lastWeight: last.weight,
            days,
            gain: Math.round(gain),
            gramsPerWeek: Math.round((gain / days) * 7 * 10) / 10
        };
    }

    function describeClimb(climb) {
        if (!climb) {
            return "No weight climb on record";
        }

        return `+${climb.gain}g in ${climb.days} days (+${climb.gramsPerWeek}g/week)`;
    }

    function incubationDays(value) {
        const days = Math.round(Number(value));

        return Number.isFinite(days) && days >= MIN_INCUBATION_DAYS && days <= MAX_INCUBATION_DAYS
            ? days
            : DEFAULT_INCUBATION_DAYS;
    }

    function validDate(value) {
        const clean = text(value).slice(0, 10);

        return parseDate(clean) ? clean : "";
    }

    // A recorded ovulation is a fact, so it replaces the estimate. Everything
    // else still comes from the shed, with the climb deciding how much the
    // record supports the estimate.
    function estimate(pair, female, options = {}) {
        const shedDate = text(pair && pair.preLayShedDate).slice(0, 10);

        if (!parseDate(shedDate)) {
            return null;
        }

        const recordedOvulation = text(pair && pair.ovulationDate).slice(0, 10);
        const ovulationObserved = Boolean(pair && pair.ovulationObserved) && Boolean(parseDate(recordedOvulation));
        const climb = female ? weightClimb(female, shedDate) : null;

        return {
            shedDate,
            ovulationDate: ovulationObserved ? recordedOvulation : addDays(shedDate, -OVULATION_DAYS_BEFORE_SHED),
            ovulationFrom: addDays(shedDate, -OVULATION_WINDOW[1]),
            ovulationTo: addDays(shedDate, -OVULATION_WINDOW[0]),
            ovulationObserved,
            layDate: addDays(shedDate, LAY_DAYS_AFTER_SHED),
            layFrom: addDays(shedDate, LAY_WINDOW[0]),
            layTo: addDays(shedDate, LAY_WINDOW[1]),
            weightClimb: climb,
            confidence: climb ? "supported" : "shed-only"
        };
    }

    // Everything a printed card needs, for a pair that is still waiting or a
    // clutch that already has eggs on record. The stages are kept generic so
    // the card renders a shed-to-hatch rail whether the middle dates are
    // estimates or facts.
    function card(record, female, options = {}) {
        const result = estimate(record, female);
        const laidDate = validDate(record && (record.laidDate || record.eggsLaidDate));
        const hatchedDate = validDate(record && record.hatchedDate);
        const days = incubationDays(
            options.incubationDays !== undefined
                ? options.incubationDays
                : record && record.incubationDays
        );
        const layDate = laidDate || (result ? result.layDate : "");
        const hatchDate = hatchedDate || (layDate ? addDays(layDate, days) : "");

        if (!result && !laidDate && !hatchDate) {
            return null;
        }

        const eggCount = Math.max(0, Math.round(Number(record && record.eggCount) || 0));
        const stages = [];

        if (result) {
            stages.push({
                key: "shed",
                label: "Pre-lay shed",
                date: result.shedDate,
                from: "",
                to: "",
                observed: true,
                note: "The anchor for the dates below"
            });
            stages.push({
                key: "ovulation",
                label: result.ovulationObserved ? "Ovulation" : "Ovulation (est.)",
                date: result.ovulationDate,
                from: result.ovulationObserved ? "" : result.ovulationFrom,
                to: result.ovulationObserved ? "" : result.ovulationTo,
                observed: result.ovulationObserved,
                note: result.ovulationObserved
                    ? "Recorded on the pairing"
                    : `${OVULATION_WINDOW[0]}\u2013${OVULATION_WINDOW[1]} days before the shed`
            });
        }

        stages.push({
            key: "eggs",
            label: laidDate ? "Eggs laid" : "Eggs due (est.)",
            date: layDate,
            from: laidDate || !result ? "" : result.layFrom,
            to: laidDate || !result ? "" : result.layTo,
            observed: Boolean(laidDate),
            note: laidDate
                ? "On record"
                : `${LAY_WINDOW[0]}\u2013${LAY_WINDOW[1]} days after the shed`
        });

        stages.push({
            key: "hatch",
            label: hatchedDate ? "Hatched" : "Hatch due",
            date: hatchDate,
            from: "",
            to: "",
            observed: Boolean(hatchedDate),
            note: `${days} days in the incubator`
        });

        return {
            shedDate: result ? result.shedDate : "",
            ovulationDate: result ? result.ovulationDate : "",
            ovulationFrom: result ? result.ovulationFrom : "",
            ovulationTo: result ? result.ovulationTo : "",
            ovulationObserved: result ? result.ovulationObserved : false,
            laidDate,
            layDate,
            layFrom: laidDate || !result ? "" : result.layFrom,
            layTo: laidDate || !result ? "" : result.layTo,
            hatchDate,
            hatchedDate,
            incubationDays: days,
            weightClimb: result ? result.weightClimb : null,
            confidence: result ? result.confidence : "",
            eggCount,
            stages
        };
    }

    window.BreedingTimeline = {
        OVULATION_DAYS_BEFORE_SHED,
        OVULATION_WINDOW,
        LAY_DAYS_AFTER_SHED,
        LAY_WINDOW,
        CLIMB_WINDOW_DAYS,
        MIN_CLIMB_SPAN_DAYS,
        MIN_CLIMB_GRAMS,
        MIN_CLIMB_PERCENT,
        DEFAULT_INCUBATION_DAYS,
        parseDate,
        dateText,
        addDays,
        daysBetween,
        weightClimb,
        describeClimb,
        incubationDays,
        estimate,
        card
    };
})();
