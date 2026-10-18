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
            }

            if (event === "SIGNED_OUT") {
                // A reload is the honest reset: every page reads its data from
                // localStorage, and a half-signed-out page would show the
                // previous account's collection.
                window.location.reload();
            }
        });
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
