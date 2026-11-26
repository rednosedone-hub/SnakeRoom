// Page-level feature locks. These stay dormant during beta and only become
// active when BILLING_LIVE is switched on for launch.
(function () {
    const requirements = {
        scan: { name: "Scan Session", plan: "Keeper" },
        breeding: { name: "Breeding tools", plan: "Breeder" },
        planner: { name: "Goal Planner", plan: "Breeder" },
        finance: { name: "Finance tools", plan: "Pro" },
        storefront: { name: "Storefront", plan: "Pro" }
    };

    async function check() {
        const feature = document.body.dataset.requiredFeature;
        const requirement = requirements[feature];
        if (!requirement || !window.SnakePlans || !window.SnakePlans.BILLING_LIVE) return;

        await window.SnakePlans.ready;
        if (window.SnakePlans.allows(feature)) return;

        const lock = document.createElement("section");
        lock.className = "plan-access-lock";
        lock.setAttribute("role", "dialog");
        lock.setAttribute("aria-modal", "true");
        lock.innerHTML = `
            <div class="plan-access-card">
                <p class="plan-access-eyebrow">${requirement.plan} plan feature</p>
                <h2>${requirement.name} is not included in your current plan.</h2>
                <p>Your collection stays safe. Change plans any time from Account.</p>
                <a class="main-button" href="account.html#planSection">View plans</a>
            </div>
        `;
        document.body.appendChild(lock);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check);
    else check();
})();
