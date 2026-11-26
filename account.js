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
        const yearly = document.getElementById("yearlyBillingToggle")?.checked || false;

        if (!window.SnakePlans || !currentCard || !grid) {
            return;
        }

        const signedIn = Boolean(session);
        const plan = window.SnakePlans.getPlan();
        const lines = window.SnakePlans.describePlan(plan.id);
        const betaBanner = document.getElementById("betaPricingBanner");
        if (betaBanner) betaBanner.hidden = plan.id !== "beta";

        currentCard.innerHTML = signedIn
            ? `
                <p class="plan-card-name">${escapeHtml(plan.name)}</p>
                <p class="plan-card-tagline">${escapeHtml(plan.tagline)}</p>
                <ul class="plan-lines">${lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
                ${window.SnakePlans.getProfile()?.stripe_customer_id
                    ? `<button type="button" class="secondary-button plan-cta" id="billingPortalButton">Manage Subscription</button>`
                    : ""}
            `
            : `
                <p class="plan-card-name">Not signed in</p>
                <p class="plan-card-tagline">Sign in to see which plan this account is on.</p>
            `;

        grid.innerHTML = window.SnakePlans.LAUNCH_TIERS.map(item => {
            const price = item.monthly === 0
                ? "$0 / mo"
                : yearly
                    ? `$${item.yearly} CAD / yr <small>(2 months free)</small>`
                    : `$${item.monthly} CAD / mo`;
            const isCurrent = plan.id === item.id;
            const cta = isCurrent
                ? `<button type="button" class="secondary-button plan-cta" disabled>Current Plan</button>`
                : !signedIn
                    ? `<a class="secondary-button plan-cta" href="#signInSection">${escapeHtml(item.cta)}</a>`
                    : !window.SnakePlans.BILLING_LIVE || plan.id === "beta"
                        ? `<button type="button" class="secondary-button plan-cta" disabled title="Purchases are off during beta.">Preview during beta</button>`
                        : item.id === "free"
                            ? `<button type="button" class="secondary-button plan-cta" disabled>Free plan</button>`
                            : `<button type="button" class="secondary-button plan-cta" data-checkout-tier="${item.id}">${escapeHtml(item.cta)}</button>`;

            return `
                <article class="plan-option${item.popular ? " plan-option-popular" : ""}">
                    ${item.popular ? `<p class="plan-badge">Most Popular</p>` : ""}
                    <h4 class="plan-card-name">${escapeHtml(item.name)}</h4>
                    <p class="plan-price">${price}</p>
                    <p class="plan-card-tagline">${escapeHtml(item.tagline)}</p>
                    <ul class="plan-lines">
                        <li><strong>${escapeHtml(item.animals)}</strong> (${escapeHtml(item.photos)})</li>
                        ${item.features.map(line => `<li>${escapeHtml(line)}</li>`).join("")}
                    </ul>
                    ${cta}
                </article>
            `;
        }).join("");
    }

    function wireBillingToggle() {
        const toggle = document.getElementById("yearlyBillingToggle");
        if (toggle) {
            toggle.addEventListener("change", async () => {
                let session = null;
                try { session = await window.CloudSync.getSession(); } catch (error) { session = null; }
                renderPlanCards(session);
            });
        }
    }

    async function startCheckout(tierId) {
        const report = document.getElementById("planNote");
        const button = document.querySelector(`[data-checkout-tier="${tierId}"]`);
        if (!window.CloudSync || !button) return;
        const yearly = document.getElementById("yearlyBillingToggle")?.checked || false;
        button.disabled = true;
        if (report) report.textContent = "Opening secure Stripe checkout…";
        try {
            const client = window.CloudSync._getClient();
            const profile = window.SnakePlans.getProfile();
            const hasSubscription = profile?.stripe_customer_id
                && ["active", "trialing", "past_due"].includes(profile.subscription_status);
            const { data, error } = await client.functions.invoke(hasSubscription ? "create-portal" : "create-checkout", {
                body: hasSubscription ? {} : { tier: tierId, interval: yearly ? "year" : "month" }
            });
            if (error) throw error;
            if (!data || !data.url) throw new Error("Stripe did not return a checkout link.");
            window.location.assign(data.url);
        } catch (error) {
            if (report) report.textContent = error && error.message
                ? `Checkout is not ready: ${error.message}`
                : "Checkout is not ready. Please try again later.";
            button.disabled = false;
        }
    }

    function wireCheckout() {
        const grid = document.getElementById("planGrid");
        if (!grid) return;
        grid.addEventListener("click", event => {
            const button = event.target.closest("[data-checkout-tier]");
            if (button) startCheckout(button.dataset.checkoutTier);
        });
        const currentCard = document.getElementById("planCard");
        currentCard?.addEventListener("click", async event => {
            if (!event.target.closest("#billingPortalButton")) return;
            const button = event.target.closest("#billingPortalButton");
            const note = document.getElementById("planNote");
            button.disabled = true;
            try {
                const client = window.CloudSync._getClient();
                const { data, error } = await client.functions.invoke("create-portal", { body: {} });
                if (error) throw error;
                if (!data || !data.url) throw new Error("Stripe did not return a portal link.");
                window.location.assign(data.url);
            } catch (error) {
                if (note) note.textContent = error && error.message ? error.message : "Could not open subscription management.";
                button.disabled = false;
            }
        });
        const params = new URLSearchParams(window.location.search);
        const note = document.getElementById("planNote");
        if (note && params.get("billing") === "success") {
            note.textContent = "Checkout complete. Your plan will update as soon as Stripe confirms the subscription.";
        }
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
        let profileError = false;

        try {
            session = await window.CloudSync.getSession();
        } catch (error) {
            session = null;
        }

        if (window.SnakePlans && session) {
            try {
                await window.SnakePlans.loadProfile(session);
            } catch (error) {
                profileError = true;
            }
        }

        renderSignedInEmail(session);

        const note = document.getElementById("planNote");

        if (note) {
            if (profileError) {
                note.textContent = "Could not load this account's plan. Refresh the page or check the billing setup.";
            } else if (!session) {
                note.textContent = "Sign in to choose a plan. Breeder Beta access is available to invited testers.";
            } else if (window.SnakePlans && window.SnakePlans.getPlan().id === "owner") {
                note.textContent = "This is the owner account. Breeder Beta accounts also have full access at no charge while selected breeders test the app.";
            } else if (window.SnakePlans && window.SnakePlans.getPlan().id === "beta") {
                note.textContent = "You have full access at no charge during the Breeder Beta.";
            } else {
                note.textContent = `Current plan: ${window.SnakePlans.getPlan().name}.`;
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
        wireBillingToggle();
        wireCheckout();
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
        // ---- Animal transfers -------------------------------------------------
    //
    // Outgoing transfers live with the animal's record; this page is where a
    // keeper sees what was sent to them and claims it. Accepting is the only
    // step that touches the local collection.
    function wireTransfers() {
        const section = document.getElementById("transferSection");

        if (!section || !window.TransferSync || !window.TransferHelpers) {
            return;
        }

        const refreshButton = document.getElementById("refreshTransfersButton");
        const statusNode = document.getElementById("transferListStatus");
        const incomingNode = document.getElementById("transferIncomingList");
        const sentNode = document.getElementById("transferSentList");

        function esc(value) {
            return String(value === undefined || value === null ? "" : value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");
        }

        function setStatus(message) {
            statusNode.textContent = message || "";
        }

        function rowHtml(detail, extra) {
            return `
                <div class="scan-session-item">
                    <span class="scan-session-name">${esc(detail.label)}</span>
                    <span class="scan-session-kind">${esc(detail.morph)}</span>
                    <span class="scan-session-summary">${esc(extra)}</span>
                </div>`;
        }

        function renderTransfers(data) {
            const incoming = (data.incoming || []).filter(item => item.status === "pending");

            if (!incoming.length) {
                incomingNode.innerHTML = `<p class="empty-message">Nothing waiting for ${esc(data.email || "this account")}.</p>`;
            } else {
                incomingNode.innerHTML = incoming.map(item => {
                    const detail = window.TransferHelpers.describe(item);
                    const from = detail.from ? `from ${detail.from}` : "transfer";
                    const extra = `${from}${detail.created ? ` \u00b7 ${detail.created}` : ""}`;

                    return `
                        <div class="scan-session-item">
                            <span class="scan-session-name">${esc(detail.label)}</span>
                            <span class="scan-session-kind">${esc(detail.morph)}</span>
                            <span class="scan-session-summary">${esc(extra)}</span>
                            <button type="button" class="secondary-button" data-accept-transfer="${esc(item.id)}">
                                Add to collection
                            </button>
                        </div>`;
                }).join("");
            }

            const sent = data.outgoing || [];

            sentNode.innerHTML = sent.length
                ? sent.map(item => {
                    const detail = window.TransferHelpers.describe(item);
                    const state = detail.status === "accepted"
                        ? `accepted${detail.claimed ? ` ${detail.claimed}` : ""}`
                        : detail.status;

                    return rowHtml(detail, `to ${detail.to} \u00b7 ${state}`);
                }).join("")
                : `<p class="empty-message">No animals sent from this account yet.</p>`;
        }

        async function load() {
            setStatus("Checking for transfers\u2026");

            try {
                const data = await window.TransferSync.list();

                if (!data.ok) {
                    setStatus(data.error);
                    incomingNode.innerHTML = "";
                    sentNode.innerHTML = "";
                    return;
                }

                setStatus("");
                renderTransfers(data);
            } catch (error) {
                setStatus(window.TransferSync.describeError(error));
            }
        }

        async function acceptTransfer(id, button) {
            button.disabled = true;
            setStatus("Adding the animal\u2026");

            try {
                const data = await window.TransferSync.list();
                const item = data.ok ? (data.incoming || []).find(candidate => candidate.id === id) : null;

                if (!item) {
                    setStatus("That transfer is no longer available.");
                    await load();
                    return;
                }

                const helpers = window.TransferHelpers;
                const owned = window.SnakeData.loadSnakesWithIds([]);
                const already = owned.some(snake => snake.transferId === id);

                if (!already) {
                    const merged = helpers.mergeIncoming(owned, item.snake, {
                        fromName: item.from_name || item.from_email,
                        today: new Date().toISOString().slice(0, 10)
                    });

                    merged.snake.transferId = id;
                    window.SnakeData.saveStorageArray("snakes", merged.snakes);
                }

                const result = await window.TransferSync.accept(id);

                if (!result.ok) {
                    setStatus(result.error);
                    return;
                }

                setStatus(
                    already
                        ? "That animal is already in this collection."
                        : `${helpers.describe(item).label} added to this device's collection.`
                );

                if (window.CloudSync) {
                    window.CloudSync.pushCore({ interactive: false }).catch(() => {});
                }

                await load();
            } catch (error) {
                setStatus(window.TransferSync.describeError(error));
            } finally {
                button.disabled = false;
            }
        }

        incomingNode.addEventListener("click", event => {
            const button = event.target.closest("[data-accept-transfer]");

            if (!button) {
                return;
            }

            acceptTransfer(button.getAttribute("data-accept-transfer"), button);
        });

        refreshButton.addEventListener("click", load);
        load();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wireTransfers);
    } else {
        wireTransfers();
    }

    document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
