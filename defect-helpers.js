// defect-helpers.js
// Physical defects a keeper can record on one animal: a shark mouth, no eyes,
// a kink, bug eyes, small eyes, a duckbill.
//
// They belong on the animal rather than in a breeding note because they do not
// heal, they are worth passing on carefully (or not at all), and a pairing that
// keeps producing them has a problem the hatch rate alone hides. The scorecard
// counts healthy hatchlings, not just hatchlings, so this list is the one place
// the defect names live: the snake form, the hatchling editor and the scorecard
// all read it from here.

(function () {
    const DEFECTS = [
        { key: "shark-mouth", label: "Shark mouth", note: "The jaw does not meet cleanly." },
        { key: "no-eyes", label: "No eyes", note: "One or both eyes missing." },
        { key: "kinking", label: "Kinked", note: "A kink in the spine or tail." },
        { key: "bug-eyes", label: "Bug eyes", note: "Eyes stand out from the head." },
        { key: "small-eyes", label: "Small eyes", note: "Eyes noticeably undersized." },
        { key: "duckbill", label: "Duckbill", note: "Shortened, rounded snout." },
        { key: "other", label: "Other", note: "Anything else worth recording." }
    ];

    // Records typed by hand, or written before this list existed, can carry a
    // label or a loose spelling instead of a key.
    const ALIASES = {
        "shark mouth": "shark-mouth",
        sharkmouth: "shark-mouth",
        "no eyes": "no-eyes",
        noeyes: "no-eyes",
        blind: "no-eyes",
        kink: "kinking",
        kinked: "kinking",
        kinks: "kinking",
        kinking: "kinking",
        "bug eye": "bug-eyes",
        "bug eyes": "bug-eyes",
        bugeyes: "bug-eyes",
        "bug-eyed": "bug-eyes",
        "small eye": "small-eyes",
        "small eyes": "small-eyes",
        smalleyes: "small-eyes",
        "duck bill": "duckbill",
        "duck-bill": "duckbill",
        duckbill: "duckbill",
        other: "other"
    };

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function findDefect(value) {
        const key = text(value).toLowerCase();

        return DEFECTS.find(defect => defect.key === key || defect.label.toLowerCase() === key) || null;
    }

    // Anything unrecognised still counts as a defect ("Other"): a keeper who
    // typed a problem must not have it quietly discarded by the maths.
    function normalize(value) {
        const clean = text(value).toLowerCase().replace(/\s+/g, " ");

        if (!clean) {
            return "";
        }

        const direct = findDefect(clean);

        if (direct) {
            return direct.key;
        }

        if (ALIASES[clean]) {
            return ALIASES[clean];
        }

        // "Kinked tail" or "bug eye (left)" should still land on the known type.
        const prefixed = DEFECTS.find(defect => clean.startsWith(`${defect.label.toLowerCase()} `));
        const alias = Object.keys(ALIASES).find(name => clean.startsWith(`${name} `));

        return prefixed ? prefixed.key : (alias ? ALIASES[alias] : "other");
    }

    // A snake carries a list: one kink, or several problems at once.
    function keys(snake) {
        const raw = [];

        if (Array.isArray(snake && snake.defects)) {
            raw.push(...snake.defects);
        } else if (typeof (snake && snake.defects) === "string") {
            raw.push(...snake.defects.split(","));
        }

        // Older records kept a single "defect" field.
        if (typeof (snake && snake.defect) === "string") {
            raw.push(...snake.defect.split(","));
        }

        const seen = new Set();

        return raw
            .map(normalize)
            .filter(key => {
                if (!key || seen.has(key)) {
                    return false;
                }

                seen.add(key);

                return true;
            });
    }

    function labelFor(value) {
        const defect = findDefect(normalize(value));

        return defect ? defect.label : text(value);
    }

    function labels(snake) {
        return keys(snake).map(labelFor);
    }

    function has(snake) {
        return keys(snake).length > 0;
    }

    function summary(snake, separator = ", ") {
        return labels(snake).join(separator || ", ");
    }

    function noteFor(value) {
        const defect = findDefect(normalize(value));

        return defect ? defect.note : "";
    }

    // Counts how many animals carry each defect, biggest group first, so a
    // clutch or pairing reads as "Kinked x2, Shark mouth" rather than a list of
    // animals the keeper has to count by hand.
    function tally(animals) {
        const counts = new Map();

        (animals || []).forEach(animal => {
            labels(animal).forEach(label => {
                counts.set(label, (counts.get(label) || 0) + 1);
            });
        });

        return [...counts.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
    }

    window.SnakeDefects = {
        DEFECTS,
        normalize,
        keys,
        labels,
        labelFor,
        noteFor,
        has,
        summary,
        tally
    };
})();
