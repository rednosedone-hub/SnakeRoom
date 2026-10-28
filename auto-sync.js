// auto-sync.js
// Background sync for The Snake Room.
//
// The old model was manual: open the Cloud Sync page, press Push or Pull. The
// problem: forgetting a Pull before editing data overwrote cloud changes, and
// the whole flow was bulky.
//
// New model, once a session exists:
//   - Every change to app data (snakes, breedingPairs, clutches, breedingGoals,
//     customGeneCatalog, financeSettings, financeExpenses, financeExpos,
//     feederSettings, feederInventory) marks its storage key "dirty" instantly.
//   - If online: a debounced push (8s after the last change) saves to the
//     cloud. Navigating to another page attempts an immediate push, and any
//     queue left behind is retried when the next page opens or becomes visible
//     (navigation can cancel the in-flight request).
//   - On page load: if the cloud backup is newer than what this device pulled,
//     and this device has no unsaved local changes, pull and reload.
//   - Pushes and pulls merge record by record in cloud-sync.js. A background
//     push defers applying remote changes to local storage until the next page,
//     so an open page with stale in-memory arrays can never write them back.
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
    // A push uploads the merged snapshot, so plans ride along with the next
    // collection push; the point is that planning alone never forces one.
    const AUTO_PUSH_KEYS = [
        "snakes",
        "breedingPairs",
        "clutches",
        "customGeneCatalog",
        "financeSettings",
        "financeExpenses",
        "financeExpos",
        "feederSettings",
        "feederInventory"
    ];

    const KEY_LABELS = {
        snakes: "collection",
        breedingPairs: "breeding pairs",
        clutches: "clutches",
        breedingGoals: "breeding plans",
        customGeneCatalog: "custom genes",
        financeSettings: "money settings",
        financeExpenses: "costs",
        financeExpos: "shows",
        feederSettings: "feeder settings",
        feederInventory: "feeder stock"
    };

    const state = readState();

    // Older versions could leave a whole-snapshot conflict flag behind. The
    // merge engine resolves those safely now, so a stale flag must not block
    // the queued upload forever.
    if (state.conflict) {
        delete state.conflict;
        delete state.conflictAt;
        saveState();
    }

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

    const RETRY_MS = 30000;
    let pushTimer = null;
    let retryTimer = null;
    let pushInFlight = null;

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

    function runAutoPush() {
        if (pushInFlight) {
            return pushInFlight;
        }

        if (!isOnline() || !state.dirtyKeys || Object.keys(state.dirtyKeys).length === 0) {
            return Promise.resolve("idle");
        }

        clearPushTimer();

        // Only one upload at a time. A timer, a page becoming visible, and a
        // pagehide can all ask at once; overlapping pushes would make the
        // second one look like a conflict with the first.
        pushInFlight = (async () => {
            const changeAtStart = state.lastChangeAt;
            const result = await window.CloudSync.pushCore({
                interactive: false,
                applyMerged: false
            });

            if (result === "pushed") {
                const mergeSettings = window.CloudSync.readSettings();
                const mergedRecords = Number(mergeSettings.lastMergedRecords) || 0;

                // Background pushes leave local data untouched. If the merge
                // brought in anything from another device, the next page pulls
                // it before rendering.
                if (mergedRecords > 0) {
                    state.needsPull = true;
                }

                if (state.lastChangeAt !== changeAtStart) {
                    // A write landed while the upload was in flight. Its bytes
                    // are not in that request, so keep the queue and send again.
                    saveState();
                    updateBanner();
                    scheduleAutoPush();
                    return result;
                }

                state.dirtyKeys = {};
                state.dirtyCount = 0;
                state.lastPushAt = new Date().toISOString();
                saveState();
                clearRetryTimer();
                updateBanner();
            } else if (result === "error" && isOnline() && hasCollectionChanges()) {
                // A dropped connection or a temporary server error is not a
                // reason to wait for the next edit. Try again shortly.
                scheduleRetry();
            }

            return result;
        })().finally(() => {
            pushInFlight = null;
        });

        return pushInFlight;
    }

    // A save on the snake form navigates to the collection immediately, which
    // cancels the debounce timer and can abort the pagehide request. The queue
    // survives in localStorage, so every later page must retry it instead of
    // leaving the change stranded until the next edit.
    function resumePendingPush() {
        if (!isOnline() || !hasCollectionChanges()) {
            return Promise.resolve("skipped");
        }

        return runAutoPush();
    }

    function scheduleRetry() {
        clearRetryTimer();
        retryTimer = setTimeout(() => {
            retryTimer = null;
            runAutoPush();
        }, RETRY_MS);
    }

    function clearPushTimer() {
        if (pushTimer) {
            clearTimeout(pushTimer);
            pushTimer = null;
        }
    }

    function clearRetryTimer() {
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
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

            const lastKnown = [settings.lastPulledAt, settings.lastPushedAt]
                .filter(Boolean)
                .sort((left, right) => new Date(right) - new Date(left))[0] || null;
            const needsPull = Boolean(state.needsPull);

            if (needsPull || !lastKnown || new Date(data.updated_at) > new Date(lastKnown)) {
                const changeAtStart = state.lastChangeAt;
                const result = await window.CloudSync.pullCore({
                    silent: true,
                    shouldApply: () => state.dirtyCount === 0 && state.lastChangeAt === changeAtStart
                });

                if (result === "pulled") {
                    state.needsPull = false;
                    saveState();
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

        if (!online) {
            message = `<span>${pending} change${pending === 1 ? "" : "s"} saved locally (${what}). ` +
                `You're offline \u2014 ${pending === 1 ? "it'll" : "they'll"} be saved when you're back online.</span>`;
        } else if (hasCollectionChanges()) {
            message = `<span>${pending} change${pending === 1 ? "" : "s"} saved on this device but not in the cloud yet (${what}).</span>`;
        } else {
            // Plans only: nothing automatic is going to happen, and that is the
            // point — experimenting should not nag or upload half-finished ideas.
            message = `<span>${What} are kept on this device. ` +
                `Nothing is sent to the cloud until you save them.</span>`;
        }

        banner.innerHTML = `${message}
            <span class="auto-sync-actions">
                <a href="#" id="autoSyncCommitLink">Save to cloud now</a>
                <a href="#" id="autoSyncDiscardLink">Discard</a>
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

        const result = await window.CloudSync.pullCore({ silent: true, replace: true });

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
        const result = await window.CloudSync.pushCore({
            interactive: false,
            applyMerged: false
        });

        if (result === "pushed") {
            const mergeSettings = window.CloudSync.readSettings();

            if (Number(mergeSettings.lastMergedRecords) > 0) {
                state.needsPull = true;
            }

            state.lastPushAt = new Date().toISOString();
            clearPending();
            return;
        }

        if (result === "no-session") {
            alert("Sign in on the Account page to save to the cloud. For now the changes stay on this device.");
        } else if (result !== "pushed") {
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
        clearRetryTimer();
        updateBanner();
    }

    window.addEventListener("online", handleBackOnline);
    window.addEventListener("offline", handleGoingOffline);

    // Returning to the app is another chance to upload a queued collection
    // change without making the keeper press anything.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            resumePendingPush();
        }
    });

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
        setTimeout(() => {
            maybeAutoPull();
            resumePendingPush();
        }, 1500);
    });

    // ---- Exposed for testing ------------------------------------------------

    window.AutoSync = {
        _state: state,
        markDirty,
        runAutoPush,
        resumePendingPush,
        commitPendingChanges,
        discardPendingChanges,
        maybeAutoPull,
        updateBanner,
        withWritesIgnored,
        describePending,
        hasCollectionChanges
    };
})();
