// Hatchling IDs: one code per animal, built from the keeper's prefix and the
// clutch. Clutch 2026-01 with prefix SS gives SS-C26-1-01, -02, -03 for its
// hatchlings, so ID sort groups the siblings and a code never repeats.
//
// Kept apart from the page so the format and the "which animals belong to this
// clutch" question can be tested without a browser.
(function () {
    const DEFAULT_PREFIX = "SS";

    function text(value) {
        return value === undefined || value === null ? "" : String(value);
    }

    function normalizePrefix(value) {
        return text(value)
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 8) || DEFAULT_PREFIX;
    }

    // 2026-01 -> SS-C26-1. An imported clutch with a custom id is kept readable
    // instead of being given an invented number.
    function baseFor(clutchId, prefix) {
        const id = text(clutchId).trim();
        const match = /^(\d{4})-(\d+)$/.exec(id);
        const code = normalizePrefix(prefix);

        if (match) {
            return `${code}-C${match[1].slice(2)}-${Number(match[2])}`;
        }

        const fallback = id
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-+|-+$/g, "")
            .toUpperCase() || "CLUTCH";

        return `${code}-${fallback}`;
    }

    // The running number in a hatchling ID, or null when the code is not one of
    // this clutch's hatchlings.
    function numberOf(identity, base) {
        const id = text(identity).trim().toUpperCase();
        const wanted = `${text(base).trim().toUpperCase()}-`;

        if (!id.startsWith(wanted)) {
            return null;
        }

        const suffix = id.slice(wanted.length);

        if (!/^\d+$/.test(suffix)) {
            return null;
        }

        const number = Number(suffix);

        return number > 0 ? number : null;
    }

    function idFor(clutchId, prefix, number) {
        const base = baseFor(clutchId, prefix);
        const count = Math.max(0, Math.round(Number(number)) || 0);

        return `${base}-${String(count).padStart(2, "0")}`;
    }

    // Continue after the highest suffix already linked to this clutch, so a late
    // hatchling is never given SS-C26-1-03 twice.
    function nextNumber(clutch, prefix, snakes) {
        const base = baseFor(clutch && clutch.id, prefix);
        const clutchId = text(clutch && clutch.id);
        const used = (snakes || [])
            .filter(snake => text(snake && snake.clutchId) === clutchId)
            .map(snake => numberOf(text(snake && snake.ID) || text(snake && snake.morph), base))
            .filter(number => number !== null);

        return (used.length > 0 ? Math.max(...used) : 0) + 1;
    }

    // Old hatchlings were saved before their clutch existed, often with only the
    // morph field filled in. Anything carrying this clutch's code and not
    // already grouped into another clutch is a candidate to link.
    //
    // A snake already stamped with this clutch (or with a clutch id that no
    // longer exists after a restore) is still a candidate, so a record created
    // later can pick it up; a snake grouped into a different live clutch is not.
    function unlinkedCandidates(clutchId, prefix, snakes, knownClutchIds) {
        const base = baseFor(clutchId, prefix);
        const wantedClutch = text(clutchId);
        const liveClutches = new Set((knownClutchIds || []).map(text));

        return (snakes || []).filter(snake => {
            if (!snake) {
                return false;
            }

            const snakeClutch = text(snake.clutchId);

            if (text(snake.clutchToken) || (
                snakeClutch &&
                snakeClutch !== wantedClutch &&
                liveClutches.has(snakeClutch)
            )) {
                return false;
            }

            return numberOf(text(snake.ID) || text(snake.morph), base) !== null;
        });
    }

    const api = {
        DEFAULT_PREFIX,
        normalizePrefix,
        baseFor,
        idFor,
        numberOf,
        nextNumber,
        unlinkedCandidates
    };

    if (typeof window !== "undefined") {
        window.HatchlingIds = api;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
