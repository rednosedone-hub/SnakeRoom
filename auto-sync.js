// auto-sync.js
// Background sync for The Snake Room.
//
// The old model was manual: open the Cloud Sync page, press Push or Pull. The
// problem: forgetting a Pull before editing data overwrote cloud changes, and
// the whole flow was bulky.
//
// New model, once a session exists:
//   - Every change to app data (snakes, breedingPairs, clutches, breedingGoals,
//     customGeneCatalog, financeSettings, financeExpenses, financeExpos) marks
//     its storage key "dirty" instantly.
//   - If online: a debounced push (8s after the last change) saves to the
//     cloud. Navigating to another page forces an immediate push so nothing
//     is lost mid-browse.
//   - On page load: if the cloud backup is newer than what this device pulled,
//     and this device has no unsaved local changes, pull and reload.
//   - If offline: changes keep saving locally. A panel on every page shows
//     "N changes not pushed yet" and, once back online, asks to commit them
//     (one confirm, then they push).
//
// Photos keep using the snake form's own upload path. Nothing about the
// snapshot format changes; the CloudSync.pushCore/pullCore engines do the work.

(function () {
    const SYNC_STATE_KEY = "autoSyncState";
    const DEBOUNCE_MS = 8000;
    const DIRTY_KEYS = window.CloudSync.SNAPSHOT_KEYS;

    // Collection facts (who you own, what they ate) push themselves. Breeding
    // plans are experiments — you try combinations, most of which you throw
    // away — so they stay on this device until you ask for them to be saved.
    // A push always sends the whole snapshot, so plans ride along with the next
    // collection push; the point is that planning alone never forces one.
    const AUTO_PUSH_KEYS = [
        "snakes",
        "breedingPairs",
        "clutches",
        "customGeneCatalog",
        "financeSettings",
        "financeExpenses",
        "financeExpos"
    ];

    const KEY_LABELS = {
        snakes: "collection",
        breedingPairs: "breeding pairs",
        clutches: "clutches",
        breedingGoals: "breeding plans",
        customGeneCatalog: "custom genes",
        financeSettings: "money settings",
        financeExpenses: "costs",
        financeExpos: "shows"
    };

    const state = readState();

    function readState() {
        try {
            return JSON.parse(localStorage.getItem(SYNC_STATE_KEY)) || {};
        } catch {
            return {};
        }
    }

    function saveState() {
        localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
    }

    function isOnline() {
        return navigator.onLine !== false;
    }

    // ---- Dirty tracking -----------------------------------------------------

    // Wraps SnakeData.saveStorageArray so every app change is seen here without
    // touching any page code.
    const originalSave = window.SnakeData.saveStorageArray;

    // A pull writes the cloud copy into local storage; that is not a local
    // change, so writes made while restoring are ignored.
    let ignoringWrites = false;

    function withWritesIgnored(callback) {
        const previous = ignoringWrites;
        ignoringWrites = true;

        try {
            return callback();
        } finally {
            ignoringWrites = previous;
        }
    }

    window.SnakeData.saveStorageArray = function (key, items) {
        originalSave.call(window.SnakeData, key, items);

        if (!ignoringWrites && DIRTY_KEYS.includes(key)) {
            markDirty(key);
        }
    };

    function markDirty(key) {
        state.dirtyKeys = state.dirtyKeys || {};
        state.dirtyKeys[key] = true;
        state.dirtyCount = Object.keys(state.dirtyKeys).length;
        state.lastChangeAt = new Date().toISOString();
        saveState();
        updateBanner();
        scheduleAutoPush();
    }

    // Direct localStorage.setItem calls on snapshot keys (imports, migrations)
    // also mark the data dirty.
    const originalSetItem = localStorage.setItem.bind(localStorage);

    localStorage.setItem = function (key, value) {
        originalSetItem(key, value);

        if (!ignoringWrites && DIRTY_KEYS.includes(key)) {
            markDirty(key);
        }
    };

    // ---- Auto push ----------------------------------------------------------

    let pushTimer = null;

    function pendingKeys() {
        return Object.keys(state.dirtyKeys || {});
    }

    // Anything that changes the records, as opposed to just the plans.
    function hasCollectionChanges() {
        return pendingKeys().some(key => AUTO_PUSH_KEYS.includes(key));
    }

    function describePending() {
        const labels = pendingKeys().map(key => KEY_LABELS[key] || key);

        if (labels.length === 0) {
            return "your changes";
        }

        if (labels.length === 1) {
            return labels[0];
        }

        return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    }

    function scheduleAutoPush() {
        if (!isOnline() || !hasCollectionChanges()) {
            // No connection, or only plans changed: stay queued locally until
            // the user saves them (or until a collection change pushes them).
            return;
        }

        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
            runAutoPush();
        }, DEBOUNCE_MS);
    }

    async function runAutoPush() {
        if (!isOnline() || !state.dirtyKeys || Object.keys(state.dirtyKeys).length === 0) {
            return;
        }

        clearPushTimer();

        const result = await window.CloudSync.pushCore({ interactive: false });

        if (result === "pushed") {
            state.dirtyKeys = {};
            state.dirtyCount = 0;
            state.lastPushAt = new Date().toISOString();
            saveState();
            updateBanner();
        } else if (result === "conflict") {
            // Cloud is newer than this device's last seen state. Local changes
            // stay queued locally; the reconnect flow will ask the user.
            state.conflict = true;
            state.conflictAt = new Date().toISOString();
            saveState();
            updateBanner();
        }
        // other results ("no-session", "error"): stay dirty, try again later.
    }

    function clearPushTimer() {
        if (pushTimer) {
            clearTimeout(pushTimer);
            pushTimer = null;
        }
    }

    // ---- Auto pull on load ---------------------------------------------------

    async function maybeAutoPull() {
        if (!isOnline()) {
            return;
        }

        const settings = window.CloudSync.readSettings();

        if (!settings.supabaseUrl || !settings.supabaseKey) {
            return;
        }

        const session = await window.CloudSync.getSession().catch(() => null);

        if (!session) {
            return;
        }

        if (state.dirtyCount > 0) {
            // Unsaved local changes: never silently overwrite them. The
            // reconnect/pending flow below handles this instead.
            return;
        }

        try {
            const activeClient = window.CloudSync._getClient();

            if (!activeClient) {
                return;
            }

            const { data, error } = await activeClient
                .from("snake_room_backups")
                .select("updated_at")
                .eq("user_id", session.user.id)
                .maybeSingle();

            if (error || !data || !data.updated_at) {
                return;
            }

            const lastKnown = settings.lastPulledAt || settings.lastPushedAt || null;

            if (!lastKnown || new Date(data.updated_at) > new Date(lastKnown)) {
                // Pull, then reload so every page picks up the fresh data.
                const result = await window.CloudSync.pullCore({ silent: true });

                if (result === "pulled") {
                    window.location.reload();
                }
            }
        } catch {
            // Silent: offline or connection problems just mean "not now".
        }
    }

    // ---- Pending changes panel -----------------------------------------------

    function isSnapshotPage() {
        // The account page has its own sync controls, so the floating panel
        // would only repeat them.
        return !/account\.html/.test(window.location.pathname);
    }

    function buildBanner() {
        if (document.getElementById("autoSyncBanner")) {
            return;
        }

        const banner = document.createElement("div");
        banner.id = "autoSyncBanner";
        banner.className = "auto-sync-banner";
        banner.style.display = "none";
        document.body.appendChild(banner);
    }

    function updateBanner() {
        const banner = document.getElementById("autoSyncBanner");

        if (!banner || !isSnapshotPage()) {
            document.body.classList.remove("has-sync-banner");
            return;
        }

        const pending = state.dirtyCount || 0;

        if (pending === 0) {
            banner.style.display = "none";
            document.body.classList.remove("has-sync-banner");
            return;
        }

        const what = describePending();
        const What = what.charAt(0).toUpperCase() + what.slice(1);
        const online = isOnline();
        let message;

        if (state.conflict) {
            // No verb agreement to get wrong: "your breeding plans is" was the
            // kind of sentence this avoids.
            message = `<span>The cloud backup changed on another device since this one last synced. ` +
                `Changes to your ${what} are still only on this device.</span>`;
        } else if (!online) {
            message = `<span>${pending} change${pending === 1 ? "" : "s"} saved locally (${what}). ` +
                `You're offline \u2014 ${pending === 1 ? "it'll" : "they'll"} be saved when you're back online.</span>`;
        } else if (hasCollectionChanges()) {
            message = `<span>${pending} change${pending === 1 ? "" : "s"} saved locally (${what}).</span>`;
        } else {
            // Plans only: nothing automatic is going to happen, and that is the
            // point — experimenting should not nag or upload half-finished ideas.
            message = `<span>${What} are kept on this device. ` +
                `Nothing is sent to the cloud until you save them.</span>`;
        }

        banner.innerHTML = `${message}
            <span class="auto-sync-actions">
                <a href="#" id="autoSyncCommitLink">${state.conflict ? "Keep this device's changes" : "Save to cloud"}</a>
                <a href="#" id="autoSyncDiscardLink">${state.conflict ? "Use cloud version" : "Discard"}</a>
            </span>`;

        const commitLink = document.getElementById("autoSyncCommitLink");
        const discardLink = document.getElementById("autoSyncDiscardLink");

        if (commitLink) {
            commitLink.addEventListener("click", event => {
                event.preventDefault();
                commitPendingChanges();
            });
        }

        if (discardLink) {
            discardLink.addEventListener("click", event => {
                event.preventDefault();
                discardPendingChanges();
            });
        }

        banner.style.display = "flex";

        // The banner is fixed to the bottom, so reserve room for it or it
        // covers the last control on the page.
        document.body.classList.add("has-sync-banner");
    }

    function clearPending() {
        state.dirtyKeys = {};
        state.dirtyCount = 0;
        state.conflict = false;
        saveState();
        updateBanner();
    }

    // Throwing local changes away means going back to the last cloud copy, not
    // just hiding the badge: the experiments are the thing being discarded.
    async function discardPendingChanges() {
        const what = describePending();
        const online = isOnline();

        if (!online) {
            alert("You're offline. Reconnect, then discard to restore the cloud copy.");
            return;
        }

        if (!confirm(`Discard the unsaved ${what} and load the cloud copy instead?\n\nThis cannot be undone.`)) {
            return;
        }

        const result = await window.CloudSync.pullCore({ silent: true });

        if (result === "pulled") {
            clearPending();
            window.location.reload();
            return;
        }

        if (result === "no-session") {
            alert("Sign in on the Account page first \u2014 discarding restores the copy stored in your account.");
            return;
        }

        if (result === "empty") {
            // Nothing in the cloud to restore. Clearing the badge would claim
            // the changes were discarded when they are still the only copy.
            const clearBadge = confirm(
                "There is no cloud backup to restore yet.\n\n" +
                "Your changes are the only copy. Clear the pending badge and keep them on this device?"
            );

            if (clearBadge) {
                clearPending();
            }
            return;
        }

        alert("Could not reach the cloud copy. Nothing was discarded.");
    }

    async function commitPendingChanges() {
        if (state.conflict) {
            const reallyPush = confirm(
                "The cloud backup changed on another device since this device last synced.\n\n" +
                "Committing your local changes will overwrite the cloud backup (the other device's changes are not merged).\n\n" +
                "Overwrite the cloud with this device's changes?"
            );

            if (!reallyPush) {
                return;
            }
        }

        const result = await window.CloudSync.pushCore({ interactive: false });

        if (result === "pushed") {
            state.lastPushAt = new Date().toISOString();
            clearPending();
            return;
        }

        if (result === "no-session") {
            alert("Sign in on the Account page to save to the cloud. For now the changes stay on this device.");
        } else if (result !== "conflict") {
            alert("Could not save to the cloud right now. Your changes are still on this device; try again from the Account page.");
        }
    }

    // ---- Reconnect flow -------------------------------------------------------

    function handleBackOnline() {
        updateBanner();

        if (state.dirtyCount > 0 && hasCollectionChanges()) {
            const answer = confirm(
                "You're back online. " +
                `${state.dirtyCount} change${state.dirtyCount === 1 ? "" : "s"} were saved locally while you were offline.\n\n` +
                "Commit them to the cloud now?"
            );

            if (answer) {
                commitPendingChanges();
            }
        }
    }

    function handleGoingOffline() {
        clearPushTimer();
        updateBanner();
    }

    window.addEventListener("online", handleBackOnline);
    window.addEventListener("offline", handleGoingOffline);

    // Flush on navigate so no change is lost when you browse away.
    window.addEventListener("pagehide", () => {
        if (isOnline() && hasCollectionChanges()) {
            // Fire-and-forget: the snapshot is saved synchronously in local
            // storage either way, so the next page simply retry-pushes.
            runAutoPush();
        }
    });

    // Delayed initial check: LoginPage might still be signing in.
    window.addEventListener("DOMContentLoaded", () => {
        buildBanner();
        updateBanner();
        setTimeout(maybeAutoPull, 1500);
    });

    // ---- Exposed for testing ------------------------------------------------

    window.AutoSync = {
        _state: state,
        markDirty,
        runAutoPush,
        commitPendingChanges,
        discardPendingChanges,
        maybeAutoPull,
        updateBanner,
        withWritesIgnored,
        describePending,
        hasCollectionChanges
    };
})();
