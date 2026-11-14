// Scan Session helpers: turn a scanned bin-card QR into an animal, and write the
// feeding or weighing entry with the same shapes the rest of the app uses.
//
// Kept away from the page so the parsing and the record shapes can be tested
// without a camera or a browser.
(function () {
    const MAX_WEIGHT = 10000;

    // Ovulation takes a female off the feeding list on purpose, exactly as the
    // feeding session page does, so both pages leave the collection agreeing.
    const HOLD_REASONS = ["Ovulation"];

    function text(value) {
        return value === undefined || value === null ? "" : String(value);
    }

    function dateText(value) {
        const clean = text(value).trim().slice(0, 10);

        return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : "";
    }

    // A bin-card QR is the snake's profile URL, but a keeper can also type the
    // uid, the ID, or the name when a code will not scan.
    function parseScanPayload(value) {
        const raw = text(value).trim();

        if (!raw) {
            return "";
        }

        const match = /[?&]uid=([^&#]+)/i.exec(raw);

        if (match) {
            try {
                return decodeURIComponent(match[1]).trim();
            } catch (error) {
                return match[1].trim();
            }
        }

        return raw;
    }

    function identityValues(snake) {
        return [snake.id, snake.ID, snake.morph, snake.name]
            .map(value => text(value).trim().toLowerCase())
            .filter(Boolean);
    }

    // Prefer the internal id (what the QR carries), then the keeper's ID, then
    // the name, so two animals that share a morph never steal each other's scan.
    function findSnake(snakes, payload) {
        const key = parseScanPayload(payload).toLowerCase();

        if (!key) {
            return null;
        }

        const list = (snakes || []).filter(Boolean);
        const direct = list.find(snake => text(snake.id).trim().toLowerCase() === key);

        if (direct) {
            return direct;
        }

        return list.find(snake => identityValues(snake).includes(key)) || null;
    }

    function latestWeight(snake) {
        const history = Array.isArray(snake && snake.weightHistory) ? snake.weightHistory : [];
        // Two weigh-ins on one day are both real records; the later one is the
        // current weight, so an equal date falls back to the entry's position.
        const entries = history
            .map((entry, index) => ({
                date: dateText(entry && entry.date),
                weight: Number(entry && (entry.weight ?? entry.value)),
                index
            }))
            .filter(entry => entry.weight > 0)
            .sort((left, right) => right.date.localeCompare(left.date) || right.index - left.index);

        if (entries.length > 0) {
            return { date: entries[0].date, weight: entries[0].weight };
        }

        const weight = Number(snake && snake.weight);

        return weight > 0 ? { date: "", weight } : null;
    }

    // A refusal is logged but is not a meal, so lastFed stays where it was and
    // the snake stays on the due list, unless the reason is a hold. Returns the
    // stock the meal used, if any.
    function applyFeeding(snake, options = {}) {
        const date = dateText(options.date);
        const result = text(options.result).trim() || "Accepted";
        const feederSize = text(options.feederSize).trim();
        const reason = result === "Refused" ? text(options.reason).trim() : "";

        if (!date) {
            return { ok: false, error: "Choose the feeding date." };
        }

        if (!Array.isArray(snake.feedingHistory)) {
            snake.feedingHistory = [];
        }

        const entry = { date, feederSize, result };

        // Cost the meal now, at today's price.
        if (typeof window !== "undefined" && window.SnakeFinance) {
            window.SnakeFinance.priceFeedingEntry(entry);
        }

        if (reason) {
            entry.reason = reason;
        }

        if (result !== "Refused") {
            snake.lastFed = date;
        }

        const previousFeederSize = text(snake.feederSize);
        const previousHold = snake.feedingHold || null;

        if (feederSize) {
            snake.feederSize = feederSize;
        }

        if (HOLD_REASONS.includes(reason)) {
            snake.feedingHold = { reason, since: date };
        }

        snake.feedingHistory.push(entry);

        return {
            ok: true,
            entry,
            previousFeederSize,
            previousHold,
            stock: result !== "Refused" && feederSize
                ? { size: feederSize, quantity: 1 }
                : null
        };
    }

    // Weights are grams. Anything that is not a number in a sane range is
    // rejected before it can reach the history and skew the growth chart.
    function applyWeight(snake, options = {}) {
        const date = dateText(options.date);
        const weight = Math.round(Number(text(options.weight).replace(/[^0-9.]/g, "")) * 10) / 10;

        if (!date) {
            return { ok: false, error: "Choose the weighing date." };
        }

        if (!Number.isFinite(weight) || weight <= 0) {
            return { ok: false, error: "Enter the weight in grams." };
        }

        if (weight > MAX_WEIGHT) {
            return { ok: false, error: `That is over ${MAX_WEIGHT}g; check the weight.` };
        }

        if (!Array.isArray(snake.weightHistory)) {
            snake.weightHistory = [];
        }

        const entry = { date, weight };
        const previousWeight = text(snake.weight);

        snake.weightHistory.push(entry);
        snake.weight = String(weight);

        return { ok: true, entry, previousWeight };
    }

    const api = {
        MAX_WEIGHT,
        HOLD_REASONS,
        parseScanPayload,
        findSnake,
        latestWeight,
        applyFeeding,
        applyWeight
    };

    if (typeof window !== "undefined") {
        window.ScanSession = api;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
