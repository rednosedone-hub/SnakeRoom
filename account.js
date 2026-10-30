// account.js
// The account page: who is signed in, what their plan allows, and the way back
// into the app after signing in or out. Cloud-sync.js owns the form handling
// (sign in, create, reset, sign out); this file only paints the parts that are
// specific to this page.

(function () {
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function getNextPage() {
        const next = new URLSearchParams(window.location.search).get("next") || "";

        // Only ever a page in this app: no scheme, no host, no path traversal.
        // Query strings are allowed because a scanned bin label opens
        // snake-form.html?uid=...
        if (!/^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(next)) {
            return "";
        }

        return next;
    }

    function renderPlanCards(session) {
        const currentCard = document.getElementById("planCard");
        const grid = document.getElementById("planGrid");

        if (!window.SnakePlans || !currentCard || !grid) {
            return;
        }

        const signedIn = Boolean(session);
        const plan = window.SnakePlans.getPlan();
        const lines = window.SnakePlans.describePlan(plan.id);

        currentCard.innerHTML = signedIn
            ? `
                <p class="plan-card-name">${escapeHtml(plan.name)}</p>
                <p class="plan-card-tagline">${escapeHtml(plan.tagline)}</p>
                <ul class="plan-lines">${lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
            `
            : `
                <p class="plan-card-name">Not signed in</p>
                <p class="plan-card-tagline">Sign in to see which plan this account is on.</p>
            `;

        grid.innerHTML = Object.values(window.SnakePlans.PLANS)
            .filter(item => item.id !== "owner")
            .map(item => {
                const isCurrent = signedIn && item.id === plan.id;

                return `
                    <div class="plan-option${isCurrent ? " plan-option-current" : ""}">
                        <p class="plan-card-name">${escapeHtml(item.name)}</p>
                        <ul class="plan-lines">
                            ${window.SnakePlans.describePlan(item.id)
                                .map(line => `<li>${escapeHtml(line)}</li>`)
                                .join("")}
                        </ul>
                        ${isCurrent ? `<p class="plan-badge">Current plan</p>` : ""}
                    </div>
                `;
            })
            .join("");
    }

    function renderSignedInEmail(session) {
        const line = document.getElementById("accountEmail");

        if (!line) {
            return;
        }

        line.textContent = session && session.user
            ? `Signed in as ${session.user.email || session.user.id}`
            : "Not signed in. Sign in below, or keep using this device on its own.";

        // The sync-vs-connection line only earns its space once there is an
        // account to report on.
        const statusReport = document.getElementById("cloudStatusReport");

        if (statusReport) {
            const isError = statusReport.classList.contains("import-error");
            statusReport.style.display = session || isError ? "" : "none";
        }
    }

    async function refreshAccountLine() {
        let session = null;

        try {
            session = await window.CloudSync.getSession();
        } catch (error) {
            session = null;
        }

        renderSignedInEmail(session);

        const note = document.getElementById("planNote");

        if (note) {
            if (!session) {
                note.textContent = "Sign in to see your plan. Nothing here is charged yet.";
            } else if (window.SnakePlans && window.SnakePlans.getPlan().id === "owner") {
                note.textContent = "This is the owner account, so nothing is limited and nothing is charged. "
                    + "The plans below are what other accounts will be offered once subscriptions start.";
            } else {
                note.textContent = "Billing is not switched on yet, so nothing is charged and no limit is applied. "
                    + "The plans below are what the app will enforce once subscriptions start.";
            }
        }

        renderPlanCards(session);
    }

    function watchAuth() {
        if (!window.CloudSync || typeof window.CloudSync._getClient !== "function") {
            return;
        }

        let client = null;

        try {
            client = window.CloudSync._getClient();
        } catch (error) {
            return;
        }

        if (!client) {
            return;
        }

        client.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
                // Signing in is the moment the app stops being device-only.
                try {
                    localStorage.removeItem("accountGateSkipped");
                } catch (error) {
                    // Private mode: nothing to clear.
                }

                const next = getNextPage();

                if (next && event === "SIGNED_IN") {
                    window.location.replace(next);
                    return;
                }

                refreshAccountLine();
                loadHistory();
            }

            if (event === "SIGNED_OUT") {
                // A reload is the honest reset: every page reads its data from
                // localStorage, and a half-signed-out page would show the
                // previous account's collection.
                window.location.reload();
            }
        });
    }

    // ---- Backup history ----------------------------------------------------
    // Versions are the account's own rows, so this panel only ever shows the
    // signed-in keeper's. No owner or support view exists, by design.

    const historyState = {
        rows: [],
        lastRestoreArchiveId: "",
        lastRestoreLabel: ""
    };

    function historyElement(id) {
        return document.getElementById(id);
    }

    function formatHistoryWhen(value) {
        const at = new Date(value);

        if (Number.isNaN(at.getTime())) {
            return "Unknown time";
        }

        return at.toLocaleString();
    }

    function historyDeviceLabel(device) {
        const current = String(navigator.userAgent || "").slice(0, 120);

        return device && device === current ? "This device" : "Another device";
    }

    function renderHistoryRows(result) {
        const list = historyElement("historyList");
        const count = historyElement("historyCount");
        const note = historyElement("historyNote");
        const checkpoint = historyElement("saveCheckpointButton");

        if (!list || !count) {
            return;
        }

        if (checkpoint) {
            checkpoint.disabled = !result.signedIn || result.setupNeeded;
        }

        if (!result.signedIn) {
            historyState.rows = [];
            list.innerHTML = "";
            count.textContent = "Sign in to keep a history of your backups.";

            if (note) {
                note.textContent = "Saved versions live with this account, so they follow you to another device.";
            }

            return;
        }

        if (result.setupNeeded) {
            historyState.rows = [];
            list.innerHTML = "";
            count.textContent = "The history table is not set up yet.";

            if (note) {
                note.textContent = result.error;
            }

            const advanced = document.querySelector(".account-advanced");

            if (advanced) {
                advanced.open = true;
            }

            return;
        }

        if (result.error) {
            count.textContent = "The history could not be loaded.";

            if (note) {
                note.textContent = result.error;
            }

            return;
        }

        const rows = window.BackupHistory
            ? window.BackupHistory.sortNewestFirst(result.rows)
            : result.rows;
        const limit = window.BackupHistory ? window.BackupHistory.HISTORY_LIMIT : 40;

        historyState.rows = rows;
        count.textContent = window.BackupHistory
            ? window.BackupHistory.historyCountLabel(rows.length, limit)
            : `${rows.length} versions kept`;

        if (note) {
            note.textContent = rows.length === 0
                ? "A version is saved automatically the first time a push replaces the cloud copy."
                : "";
        }

        list.innerHTML = rows.map(row => {
            const when = formatHistoryWhen(row.created_at);
            const reason = window.BackupHistory
                ? window.BackupHistory.describeReason(row.reason)
                : "Saved version";

            return `
                <article class="backup-history-row">
                    <div class="backup-history-main">
                        <strong>${escapeHtml(when)}</strong>
                        <span>${escapeHtml(reason)} \u00b7 ${escapeHtml(historyDeviceLabel(row.device))}</span>
                    </div>
                    <button type="button" class="gene-action-button" data-history-restore="${escapeHtml(row.id)}"
                        data-history-label="${escapeHtml(when)}">Restore</button>
                </article>
            `;
        }).join("");
    }

    async function loadHistory() {
        const count = historyElement("historyCount");
        const note = historyElement("historyNote");

        if (!window.CloudSync || typeof window.CloudSync.fetchHistory !== "function") {
            return;
        }

        if (count) {
            count.textContent = "Loading saved versions\u2026";
        }

        if (note) {
            note.textContent = "";
        }

        try {
            renderHistoryRows(await window.CloudSync.fetchHistory({ limit: 25 }));
        } catch (error) {
            if (count) {
                count.textContent = "The history could not be loaded.";
            }

            if (note) {
                note.textContent = error && error.message ? error.message : String(error);
            }
        }
    }

    function showHistoryUndo() {
        const undo = historyElement("historyUndo");
        const text = historyElement("historyUndoText");

        if (!undo) {
            return;
        }

        if (!historyState.lastRestoreArchiveId) {
            undo.hidden = true;
            return;
        }

        undo.hidden = false;

        if (text) {
            text.textContent = `Restored the version from ${historyState.lastRestoreLabel}.`;
        }
    }

    async function restoreHistoryVersion(id, label) {
        const status = historyElement("historyStatus");

        if (!id) {
            return;
        }

        const question = "Restore the version from " + label + "?\n\n"
            + "The data on this device is saved as a version first, so this can be undone.";

        if (!confirm(question)) {
            return;
        }

        if (status) {
            status.textContent = "Restoring\u2026";
        }

        try {
            const result = await window.CloudSync.restoreHistoryEntry(id);

            historyState.lastRestoreArchiveId = result.archivedId || "";
            historyState.lastRestoreLabel = label;
            showHistoryUndo();

            if (status) {
                status.textContent = `Restored the version from ${label}. Open any page to see it.`;
            }

            await loadHistory();
        } catch (error) {
            if (status) {
                status.textContent = error && error.message ? error.message : String(error);
            }
        }
    }

    async function undoLastRestore() {
        const status = historyElement("historyStatus");

        if (!historyState.lastRestoreArchiveId) {
            return;
        }

        if (status) {
            status.textContent = "Undoing the restore\u2026";
        }

        try {
            await window.CloudSync.restoreHistoryEntry(historyState.lastRestoreArchiveId);

            historyState.lastRestoreArchiveId = "";
            showHistoryUndo();

            if (status) {
                status.textContent = "Restore undone. Open any page to see the previous data.";
            }

            await loadHistory();
        } catch (error) {
            if (status) {
                status.textContent = error && error.message ? error.message : String(error);
            }
        }
    }

    async function saveHistoryCheckpoint() {
        const status = historyElement("historyStatus");
        const button = historyElement("saveCheckpointButton");

        if (status) {
            status.textContent = "Saving a version\u2026";
        }

        if (button) {
            button.disabled = true;
        }

        try {
            await window.CloudSync.saveCheckpoint();

            if (status) {
                status.textContent = "Version saved.";
            }

            await loadHistory();
        } catch (error) {
            if (status) {
                status.textContent = error && error.message ? error.message : String(error);
            }
        } finally {
            if (button) {
                button.disabled = false;
            }
        }
    }

    function bindHistory() {
        const list = historyElement("historyList");
        const refresh = historyElement("refreshHistoryButton");
        const checkpoint = historyElement("saveCheckpointButton");
        const undo = historyElement("historyUndoButton");

        if (list) {
            list.addEventListener("click", event => {
                const button = event.target.closest("[data-history-restore]");

                if (button) {
                    restoreHistoryVersion(button.dataset.historyRestore, button.dataset.historyLabel || "that version");
                }
            });
        }

        if (refresh) {
            refresh.addEventListener("click", loadHistory);
        }

        if (checkpoint) {
            checkpoint.addEventListener("click", saveHistoryCheckpoint);
        }

        if (undo) {
            undo.addEventListener("click", undoLastRestore);
        }
    }

    function init() {
        const emailLine = document.createElement("p");
        emailLine.id = "accountEmail";
        emailLine.className = "empty-message";
        const statusReport = document.getElementById("cloudStatusReport");

        if (statusReport && statusReport.parentNode) {
            statusReport.parentNode.insertBefore(emailLine, statusReport);
        }

        refreshAccountLine();
        watchAuth();
        bindHistory();
        loadHistory();

        if (new URLSearchParams(window.location.search).get("mode") === "create") {
            const report = document.getElementById("authReport");
            const emailInput = document.getElementById("emailInput");

            if (report) {
                report.textContent = "Choose an email and password, then press Create Account. Your collection starts empty, or this device's if it already has one.";
            }

            if (emailInput) {
                emailInput.focus();
            }
        }

        // Already signed in and sent here by a locked page: go straight back.
        window.CloudSync.getSession().then(session => {
            const next = getNextPage();

            if (session && next) {
                window.location.replace(next);
            }
        }).catch(() => {});
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
