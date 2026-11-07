// Leftover breeding links.
//
// A pair is "converted to a clutch" by storing the clutch id on the pair, and
// the Breeding page treats any pair with that id as history rather than an
// active pairing. When the clutch record is gone - deleted on an older build,
// dropped by a merge, or restored from a backup that never had it - the pair
// keeps pointing at nothing: it disappears from Active Pairs, cannot be edited,
// and the animal's record still claims "Converted to 2026-01" with a link to a
// clutch that no longer exists. There is no button for that state, which is
// what this repairs.
//
// The link is cleared, not the laying cycle: the eggs-laid date is real data,
// and losing a whole clutches list to a bad import must not silently erase the
// dates on every pair. The Breeding page already has Clear Laying Cycle for a
// keeper who wants the laid date gone too.

(function () {
    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function findClutch(clutches, id) {
        const wanted = text(id);

        if (!wanted) {
            return null;
        }

        return (Array.isArray(clutches) ? clutches : [])
            .find(clutch => clutch && text(clutch.id) === wanted) || null;
    }

    function hasClutch(clutches, id) {
        return Boolean(findClutch(clutches, id));
    }

    function orphanedPairs(pairs, clutches) {
        return (Array.isArray(pairs) ? pairs : [])
            .filter(pair => pair && text(pair.clutchId) && !hasClutch(clutches, pair.clutchId));
    }

    // Returns the same array object when nothing needed repairing, so callers
    // can use `released.length` alone to decide whether to save.
    function releaseOrphanedPairs(pairs, clutches) {
        const items = Array.isArray(pairs) ? pairs : [];
        const orphans = orphanedPairs(items, clutches);

        if (orphans.length === 0) {
            return { pairs: items, released: [] };
        }

        const released = [];

        const next = items.map(pair => {
            if (!orphans.includes(pair)) {
                return pair;
            }

            released.push({
                pair,
                clutchId: text(pair.clutchId),
                laidDate: text(pair.eggsLaidDate),
                eggCount: Number(pair.eggCount) || 0
            });

            return { ...pair, clutchId: "" };
        });

        return { pairs: next, released };
    }

    // Plain text for the line under Active Pairs; one sentence per pair.
    function describeReleased(released) {
        return (Array.isArray(released) ? released : []).map(entry => {
            const clutch = entry.clutchId || "a deleted clutch";
            const cycle = entry.laidDate
                ? ` Its laying cycle (${entry.eggCount || 0} egg${entry.eggCount === 1 ? "" : "s"} on ${entry.laidDate}) is still recorded`
                : "";

            return `Clutch ${clutch} no longer exists, so this pair is active again.${cycle} \u2014 use Clear Laying Cycle if that was only a test.`;
        });
    }

    // Reads storage, repairs it, and writes only when something changed.
    function repairStorage(data) {
        const store = data || (typeof window !== "undefined" ? window.SnakeData : null);

        if (!store || typeof store.readStorageArray !== "function") {
            return { pairs: [], released: [] };
        }

        const pairs = store.readStorageArray("breedingPairs", []);
        const clutches = store.readStorageArray("clutches", []);
        const result = releaseOrphanedPairs(pairs, clutches);

        if (result.released.length > 0) {
            store.saveStorageArray("breedingPairs", result.pairs);
        }

        return result;
    }

    const api = {
        findClutch,
        hasClutch,
        orphanedPairs,
        releaseOrphanedPairs,
        describeReleased,
        repairStorage
    };

    if (typeof window !== "undefined") {
        window.BreedingRepair = api;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
