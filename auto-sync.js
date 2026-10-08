// auto-sync.js
// Background sync for The Snake Room.
//
// The old model was manual: open the Cloud Sync page, press Push or Pull. The
// problem: forgetting a Pull before editing data overwrote cloud changes, and
// the whole flow was bulky.
//
// New model, once a session exists:
//   - Every change to app data (snakes, breedingPairs, clutches, breedingGoals,
//     customGeneCatalog) marks its storage key "dirty" instantly.
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

    window.SnakeData.saveStorageArray = function (key, items) {
        originalSave.call(window.SnakeData, key, items);

        if (DIRTY_KEYS.includes(key)) {
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

        if (DIRTY_KEYS.includes(key)) {
            markDirty(key);
        }
    };

    // ---- Auto push ----------------------------------------------------------

    let pushTimer = null;

    function scheduleAutoPush() {
        if (!isOnline()) {
            return; // stays queued; the reconnect flow asks to commit
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
        // Login and settings pages: the panel is jumpy there, and the login
        // page already has its own sync UI.
        return !/cloud-sync\.html/.test(window.location.pathname);
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
            return;
        }

        const pending = state.dirtyCount || 0;

        if (pending > 0) {
            const online = isOnline();

            banner.innerHTML = online
                ? `<span>${pending} change${pending === 1 ? "" : "s"} saved locally. ` +
                  `<a href="#" id="autoSyncCommitLink">Commit to cloud now</a></span>`
                : `<span>${pending} change${pending === 1 ? "" : "s"} saved locally. ` +
                  `You're offline \u2014 they'll be committed when you're back on the internet.</span>`;

            const link = document.getElementById("autoSyncCommitLink");

            if (link) {
                link.addEventListener("click", event => {
                    event.preventDefault();
                    commitPendingChanges();
                });
            }

            banner.style.display = "flex";
        } else {
            banner.style.display = "none";
        }
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
            state.dirtyKeys = {};
            state.dirtyCount = 0;
            state.conflict = false;
            state.lastPushAt = new Date().toISOString();
            saveState();
            updateBanner();
        }
    }

    // ---- Reconnect flow -------------------------------------------------------

    function handleBackOnline() {
        updateBanner();

        if (state.dirtyCount > 0) {
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
        if (isOnline() && state.dirtyCount > 0) {
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
        maybeAutoPull,
        updateBanner
    };
})();
