// plans.js
// Public access while a small group of breeders beta tests the app.
// Billing and public tier limits are intentionally off during the beta.

(function () {
    const PLANS = {
        beta: {
            id: "beta",
            name: "Breeder Beta",
            tagline: "Full access while we test the app with breeders. Free during beta.",
            animals: Infinity,
            photosPerSnake: Infinity,
            features: {
                breeding: true,
                planner: true,
                storefront: true,
                finance: true
            }
        },
        // The account that runs the app. Not for sale, not shown on a pricing
        // page, and never limited.
        owner: {
            id: "owner",
            name: "Owner",
            tagline: "Everything, with no limits.",
            animals: Infinity,
            photosPerSnake: Infinity,
            features: {
                breeding: true,
                planner: true,
                storefront: true,
                finance: true
            }
        }
    };

    // Planned launch pricing, shown for feedback during beta. These entries
    // are a preview only; they do not change a beta account's full access.
    const LAUNCH_TIERS = [
        {
            id: "free", name: "Free", tagline: "For pet keepers and first-time racks.",
            monthly: 0, yearly: 0, animals: "Up to 20 animals", photos: "1 photo per animal",
            features: [
                "Feeding, weight, and shed logs",
                "Individual weight history & printable Weight Sheet",
                "Morph Calculator & Morph Gallery"
            ], cta: "Start Free"
        },
        {
            id: "keeper", name: "Keeper", tagline: "For growing collections and fast rack-room care.",
            monthly: 9, yearly: 90, animals: "Up to 40 animals", photos: "3 photos per animal",
            features: [
                "Everything in Free",
                "Scan Session: continuous QR feed & weigh mode (auto-resets per tub)",
                "Printable Bin Cards: multi-card sheets & single thermal labels with QR codes"
            ], cta: "Upgrade to Keeper"
        },
        {
            id: "breeder", name: "Breeder", tagline: "For active hobby and multi-gene project breeders.",
            monthly: 24, yearly: 240, animals: "Up to 100 animals", photos: "8 photos per animal",
            popular: true,
            features: [
                "Everything in Keeper",
                "Multi-Step Goal Planner: collection gap audit & multi-generation holdback simulator",
                "Smart Breeding & Clutch Tracker: pairing logs, genetic alerts & printable timelines",
                "Clutch Growth Charts: age-normalized sibling weight curves & median tracking",
                "Project Scorecard & Season Review: holdback tracking & clutch outcomes"
            ], cta: "Upgrade to Breeder"
        },
        {
            id: "pro", name: "Pro", tagline: "For expo vendors and full breeding operations.",
            monthly: 49, yearly: 490, animals: "Unlimited animals", photos: "20 photos per animal",
            features: [
                "Everything in Breeder",
                "White-Label Storefront (Available): branded site synced live to rack weights & holds",
                "Dynamic Buyer Guide (Education): auto-generated care sheet & genetics guide from your collection",
                "Full Finances Suite: historical feeder costing, stock forecast, Show Planner & break-even math",
                "Buyers CRM & Direct Enquiries: leads and buyer records tied to animal lineage"
            ], cta: "Upgrade to Pro"
        }
    ];

    const PLAN_KEY = "accountPlan";

    // New public accounts join the beta with access to every current feature.
    const DEFAULT_PLAN = "beta";

    function isKnownPlan(planId) {
        return Object.prototype.hasOwnProperty.call(PLANS, planId);
    }

    function getPlanId() {
        let stored = "";

        try {
            stored = localStorage.getItem(PLAN_KEY) || "";
        } catch (error) {
            stored = "";
        }

        // Old browser state may still contain a pre-beta tier. Ignore it so
        // beta testers keep full access without needing to clear their storage.
        return stored === "owner" ? "owner" : DEFAULT_PLAN;
    }

    function setPlanId(planId) {
        if (planId !== "owner" && planId !== "beta") {
            return false;
        }

        localStorage.setItem(PLAN_KEY, planId);
        return true;
    }

    function getPlan(planId = getPlanId()) {
        return PLANS[planId] || PLANS[DEFAULT_PLAN];
    }

    // A feature nobody has switched off yet still has to read as "allowed" for
    // an owner, and as false for a plan that does not list it.
    function allows(feature, planId = getPlanId()) {
        return Boolean(getPlan(planId).features[feature]);
    }

    function describeLimit(value, unit) {
        if (!Number.isFinite(value)) {
            return `Unlimited ${unit}`;
        }

        return `${value} ${unit}`;
    }

    // Short lines for the account page and a future pricing page.
    function describePlan(planId = getPlanId()) {
        const plan = getPlan(planId);

        return [
            describeLimit(plan.animals, "animals"),
            `${plan.photosPerSnake === Infinity ? "Unlimited" : plan.photosPerSnake} photo${plan.photosPerSnake === 1 ? "" : "s"} per animal`,
            plan.features.breeding ? "Breeding and outcomes" : "No breeding area",
            plan.features.planner ? "Goal planner" : "No goal planner",
            plan.features.finance
                ? "Money tools: purchases, sales, feeders and show costs"
                : "No money tools",
            plan.features.storefront ? "Storefront listings" : "No storefront listings"
        ];
    }

    window.SnakePlans = {
        PLANS,
        LAUNCH_TIERS,
        DEFAULT_PLAN,
        getPlanId,
        setPlanId,
        getPlan,
        allows,
        describePlan,
        describeLimit
    };
})();
