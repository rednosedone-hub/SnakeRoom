// backup-helpers.js
// Pure helpers for the cloud backup history. Keeping the decisions here means
// the retention rules can be read (and tested) without a network or a DOM:
//
//   - what a version holds, in one line;
//   - whether this push deserves a new version, or folds into the last one;
//   - which versions fall outside the retention window.
//
// cloud-sync.js does the reading and writing, account.js paints the list.
// History is per account: every row belongs to one keeper and row level
// security keeps it there. The retention numbers are policy, not ownership —
// a plan could pass a smaller limit later without moving any data.

(function () {
    // A push happens seconds after an edit, so archiving every one of them
    // would spend the whole history on a single afternoon. Auto versions closer
    // together than this collapse into the newest one; a manual checkpoint or a
    // restore is always kept.
    const AUTO_ARCHIVE_GAP_MS = 15 * 60 * 1000;

    // How many versions one account keeps. Old ones are trimmed on the way in.
    const HISTORY_LIMIT = 40;

    function entriesOf(data, key) {
        return Array.isArray(data && data[key]) ? data[key] : [];
    }

    function plural(count, one, many) {
        return `${count} ${count === 1 ? one : many}`;
    }

    // A compact description of what a stored snapshot contains. Returns null
    // for anything that is not a Snake Room snapshot.
    function summarizeSnapshot(snapshot) {
        const data = snapshot && typeof snapshot === "object" ? snapshot.data : null;

        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return null;
        }

        return {
            snakes: entriesOf(data, "snakes").length,
            pairs: entriesOf(data, "breedingPairs").length,
            clutches: entriesOf(data, "clutches").length,
            expenses: entriesOf(data, "financeExpenses").length,
            savedAt: String(snapshot.savedAt || "")
        };
    }

    function describeSummary(summary) {
        if (!summary) {
            return "Not a readable backup";
        }

        return [
            plural(summary.snakes, "snake", "snakes"),
            plural(summary.pairs, "pair", "pairs"),
            plural(summary.clutches, "clutch", "clutches")
        ].join(" \u00b7 ");
    }

    // Why a version exists, in the keeper's words. Unknown reasons read as a
    // plain saved version rather than leaking a database value.
    function describeReason(reason) {
        const value = String(reason || "").trim();

        if (value === "auto") return "Saved automatically";
        if (value === "manual") return "Checkpoint you saved";
        if (value === "before restore") return "Before a restore";

        return "Saved version";
    }

    function createdAtOf(row) {
        return String((row && (row.createdAt || row.created_at)) || "");
    }

    // Newest first, with rows that have no usable date dropped rather than
    // sorted to a random place.
    function sortNewestFirst(rows) {
        return (Array.isArray(rows) ? rows : [])
            .filter(row => row && createdAtOf(row))
            .slice()
            .sort((left, right) => createdAtOf(right).localeCompare(createdAtOf(left)));
    }

    // True when a new automatic version should be written. A manual checkpoint
    // or a restore passes no `newest` question at all — callers archive those
    // without asking, so this only guards the automatic ones.
    function shouldArchiveAuto({ newest, now = Date.now() } = {}) {
        const at = Date.parse(createdAtOf(newest));

        if (!Number.isFinite(at)) {
            return true;
        }

        return now - at >= AUTO_ARCHIVE_GAP_MS;
    }

    // Ids past the retention limit, oldest first, so the caller deletes the
    // least useful versions and never the one just made.
    function historyIdsToDrop(rows, limit = HISTORY_LIMIT) {
        return sortNewestFirst(rows)
            .slice(limit)
            .map(row => row && row.id)
            .filter(Boolean);
    }

    function historyCountLabel(count, limit = HISTORY_LIMIT) {
        if (count === 0) {
            return "No saved versions yet.";
        }

        return `${count} of ${limit} versions kept`;
    }

    window.BackupHistory = {
        AUTO_ARCHIVE_GAP_MS,
        HISTORY_LIMIT,
        summarizeSnapshot,
        describeSummary,
        describeReason,
        sortNewestFirst,
        shouldArchiveAuto,
        historyIdsToDrop,
        historyCountLabel
    };
})();
