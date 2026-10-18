// account-gate.js
// The front door. A signed-out visitor gets one clear question: sign in (so the
// collection is backed up and follows them to another device) or carry on with
// this device's copy only.
//
// The escape hatch is deliberate. The app is used in a snake room on a phone,
// often with no signal, and a hard redirect to a sign-in page would leave the
// keeper locked out of their own feeding list. So this is a gate, not a wall:
// "Keep this device only" hides it until the browser data is cleared.
//
// When subscriptions arrive, remove the escape hatch for new accounts (and let
// the server, not this file, decide what a plan may do).

(function () {
    const SKIP_KEY = "accountGateSkipped";
    const GATE_ID = "accountGate";

    function currentPage() {
        const page = window.location.pathname.split("/").pop() || "index.html";

        return window.location.search ? `${page}${window.location.search}` : page;
    }

    function accountUrl(mode) {
        const params = new URLSearchParams();
        params.set("next", currentPage());

        if (mode) {
            params.set("mode", mode);
        }

        return `account.html?${params.toString()}`;
    }

    function hideGate() {
        const gate = document.getElementById(GATE_ID);

        if (gate) {
            gate.remove();
        }

        document.body.classList.remove("has-account-gate");
    }

    function rememberDeviceOnly() {
        try {
            localStorage.setItem(SKIP_KEY, "1");
        } catch (error) {
            // Private mode: the gate will simply come back next visit.
        }

        hideGate();
    }

    function showGate() {
        if (document.getElementById(GATE_ID)) {
            return;
        }

        const gate = document.createElement("div");
        gate.id = GATE_ID;
        gate.className = "account-gate";
        gate.innerHTML = `
            <div class="account-gate-card" role="dialog" aria-modal="true" aria-labelledby="accountGateTitle">
                <h2 id="accountGateTitle">Sign in to The Snake Room</h2>
                <p>
                    Your collection, breeding plans and photos follow you to any device, and a
                    backup is kept in the cloud. Sign in once and this device stays signed in.
                </p>
                <div class="account-gate-actions">
                    <a class="main-button" href="${accountUrl("")}">Sign In</a>
                    <a class="secondary-button" href="${accountUrl("create")}">Create Account</a>
                </div>
                <button type="button" class="account-gate-skip" id="accountGateSkip">
                    Keep this device only (no cloud backup)
                </button>
            </div>
        `;

        document.body.appendChild(gate);
        document.body.classList.add("has-account-gate");

        const skip = document.getElementById("accountGateSkip");

        if (skip) {
            skip.addEventListener("click", rememberDeviceOnly);
        }
    }

    async function checkSession() {
        if (document.body.hasAttribute("data-no-auth-gate")) {
            return;
        }

        try {
            if (localStorage.getItem(SKIP_KEY) === "1") {
                return;
            }
        } catch (error) {
            return;
        }

        if (!window.CloudSync || typeof window.CloudSync.getSession !== "function") {
            return;
        }

        let session = null;

        try {
            session = await window.CloudSync.getSession();
        } catch (error) {
            // Offline, or Supabase unreachable: never block the keeper's own
            // records because a network check failed.
            return;
        }

        if (!session) {
            showGate();
        }
    }

    function init() {
        checkSession();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Exposed for browser-console checks.
    window.AccountGate = {
        checkSession,
        showGate,
        hideGate,
        rememberDeviceOnly
    };
})();
