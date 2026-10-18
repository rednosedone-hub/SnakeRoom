// plans.js
// One place to change what each subscription tier allows.
//
// Nothing here charges money yet. It is the contract the app will enforce once
// billing is switched on: the free tier caps animals and photos and hides the
// breeding tools, and a paid tier lifts those caps. Keeping the numbers in one
// file means changing a limit is a one-line edit, not a hunt through the pages.
//
// There is no server-side authority behind these numbers yet. A plan arrives
// from a `profiles` table once that exists (see ROADMAP.md); until then the
// owner account is treated as "owner" and nothing is limited.

(function () {
    const PLANS = {
        free: {
            id: "free",
            name: "Free",
            tagline: "Keep a cloud-backed collection.",
            animals: 20,
            photosPerSnake: 1,
            features: {
                breeding: false,
                planner: false,
                storefront: false
            }
        },
        breeder: {
            id: "breeder",
            name: "Breeder",
            tagline: "Plan pairings, record clutches, track outcomes.",
            animals: 100,
            photosPerSnake: 3,
            features: {
                breeding: true,
                planner: true,
                storefront: false
            }
        },
        pro: {
            id: "pro",
            name: "Pro",
            tagline: "No limits, plus the public storefront listings.",
            animals: Infinity,
            photosPerSnake: 10,
            features: {
                breeding: true,
                planner: true,
                storefront: true
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
                storefront: true
            }
        }
    };

    const PLAN_KEY = "accountPlan";

    // Until a profiles table exists, the only account using this app is the
    // owner's. A brand-new sign-up would get "free" here instead.
    const DEFAULT_PLAN = "owner";

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

        return isKnownPlan(stored) ? stored : DEFAULT_PLAN;
    }

    function setPlanId(planId) {
        if (!isKnownPlan(planId)) {
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
            plan.features.storefront ? "Storefront listings" : "No storefront listings"
        ];
    }

    window.SnakePlans = {
        PLANS,
        DEFAULT_PLAN,
        getPlanId,
        setPlanId,
        getPlan,
        allows,
        describePlan,
        describeLimit
    };
})();
